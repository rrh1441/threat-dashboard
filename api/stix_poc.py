# /api/stix_poc.py (Vercel Serverless Function using Flask)

import os
import requests
import json
import traceback
from flask import Flask, Response, jsonify, request
from datetime import datetime, timezone, timedelta

# --- IMPORTANT: Ensure stix_mapper.py is in this SAME /api directory ---
try:
    # Assumes stix_mapper.py is in the same directory
    from stix_mapper import map_flashpoint_vuln_to_stix, TLP_WHITE_DEFINITION
except ImportError as e:
    print(f"CRITICAL ERROR: Cannot import stix_mapper: {e}. Ensure stix_mapper.py exists in the /api directory.")
    # Define dummy function so Flask app can load, but endpoint will fail clearly
    def map_flashpoint_vuln_to_stix(data): raise RuntimeError("stix_mapper not found")
    TLP_WHITE_DEFINITION = {"id": "error-marking-def-not-found"} # Dummy object

# Ensure stix2 library is installed (via requirements.txt)
try:
    from stix2 import Bundle
except ImportError:
    print("CRITICAL ERROR: stix2 library not found. Ensure it's in requirements.txt")
    # Define dummy class if import fails
    class Bundle:
        def __init__(self, *args, **kwargs): pass
        def serialize(self, *args, **kwargs): return "{}"

# --- Environment Variables (Set in Vercel Project Settings) ---
FP_API_KEY = os.environ.get('FP_API_KEY')
FP_VULN_API_URL = os.environ.get('FP_VULN_API_URL')
# Use a default page size, ensure it's an integer
try:
    FP_API_PAGE_SIZE = int(os.environ.get('FP_API_PAGE_SIZE', 500))
except (ValueError, TypeError):
    print("Warning: Invalid FP_API_PAGE_SIZE in environment. Using default 500.")
    FP_API_PAGE_SIZE = 500

# --- Flask App for Vercel ---
# Vercel's Python runtime looks for a WSGI 'app' variable
app = Flask(__name__)
# CORS is generally not needed when the frontend and API are served from the same Vercel deployment.
# If needed, uncomment and configure origins:
# from flask_cors import CORS
# CORS(app, resources={r"/api/*": {"origins": "*"}}) # Example: Allow all origins

# --- API Helper Function with Pagination ---
def get_all_flashpoint_vulnerabilities(params):
    """Queries the Flashpoint Vulnerability API with pagination."""
    if not FP_API_KEY:
        print("Error: FP_API_KEY environment variable not set.")
        return {"error": "Server configuration error: Missing API Key."}
    if not FP_VULN_API_URL:
        print("Error: FP_VULN_API_URL environment variable not set.")
        return {"error": "Server configuration error: Missing API URL."}

    headers = {"Authorization": f"Bearer {FP_API_KEY}", "Accept": "application/json"}
    # Ensure the API URL doesn't have a trailing slash if adding path segment
    api_base_url = FP_VULN_API_URL.rstrip('/')
    api_url = f"{api_base_url}/vulnerabilities"

    all_vulnerabilities = []
    current_page = 0
    page_size = FP_API_PAGE_SIZE
    total_hits = None
    # Limit the number of pages to prevent infinite loops in unexpected scenarios
    max_pages = 100 # Adjust as needed, consider API limits

    print(f"Starting vulnerability fetch. Base URL: {api_url}, Initial Params: {params}")

    while current_page < max_pages:
        page_params = params.copy()
        # 'from' is 0-based index of the first item
        page_params['from'] = current_page * page_size
        page_params['size'] = page_size
        print(f"Querying page {current_page + 1} (from={page_params['from']}, size={page_params['size']})...")

        response = None
        try:
            # Set a timeout for the request, should be less than Vercel function timeout
            # Vercel Hobby default timeout is 10s. Consider increasing via vercel.json if needed.
            response = requests.get(api_url, headers=headers, params=page_params, timeout=60) # 60s timeout per page

            print(f"-> Request URL: {response.url}") # Log the exact URL queried
            response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)

            data = response.json()
            # Uncomment for detailed debugging if needed:
            # print(f"-> Raw API Response (Page {current_page + 1}): {json.dumps(data, indent=2)}")

            # Extract results - Adjust based on actual Flashpoint API response structure
            page_vulnerabilities = data.get('results', None) # Common pattern
            if page_vulnerabilities is None:
                 # Fallback to other possible keys if 'results' is not present
                page_vulnerabilities = data.get('data', [])
            # Ensure we have a list, even if the key exists but isn't a list
            if not isinstance(page_vulnerabilities, list):
                 print(f"Warning: Expected a list for vulnerabilities, got {type(page_vulnerabilities)}. Treating as empty.")
                 page_vulnerabilities = []

            all_vulnerabilities.extend(page_vulnerabilities)
            num_returned = len(page_vulnerabilities)
            print(f"-> Got {num_returned} results on this page.")

            # Extract total hits only on the first page for efficiency
            if total_hits is None:
                raw_total = data.get('total_hits', data.get('total', None))
                total_hits_val = None
                # Handle cases where total might be a dict {'value': N} or just N
                if isinstance(raw_total, dict):
                    total_hits_val = raw_total.get('value')
                elif isinstance(raw_total, (int, str)):
                    total_hits_val = raw_total

                if total_hits_val is not None:
                    try:
                        total_hits = int(total_hits_val)
                        print(f"Total potential hits reported by API: {total_hits}")
                    except (ValueError, TypeError):
                        total_hits = None
                        print(f"Warning: Could not parse total hits value: '{total_hits_val}'")
                else:
                    total_hits = None
                    print("Warning: Total hits information not found in API response.")

            # --- Stop Conditions for Pagination ---
            # 1. If API reported 0 total hits initially
            if total_hits == 0:
                print("API reported 0 total hits. Stopping.")
                break
            # 2. If we have fetched equal to or more than the total reported hits
            if total_hits is not None and len(all_vulnerabilities) >= total_hits:
                print(f"Fetched {len(all_vulnerabilities)}/{total_hits} items. Stopping.")
                break
            # 3. If the API response indicates no more pages (e.g., missing 'next' link, depends on API)
            # Flashpoint API might not use 'next', rely on num_returned < page_size instead
            # if data.get("next") is None and num_returned > 0: # Example if API had 'next'
            #    print("API indicates no next page. Stopping.")
            #    break
            # 4. If the number of items returned in the last request is less than the page size
            if num_returned < page_size:
                print("Last page was not full. Assuming end of results.")
                break
            # 5. Reached max_pages limit (safety break) - Handled by while loop condition

            current_page += 1

        except requests.exceptions.Timeout:
            error_msg = f"API request timed out while querying Flashpoint page {current_page + 1}."
            print(f"Error: {error_msg}")
            # Return partial results if any were fetched? Or fail completely?
            # For now, fail completely on timeout.
            return {"error": error_msg} # Stop processing

        except requests.exceptions.HTTPError as e:
            # Correctly formatted block to handle HTTP errors
            error_detail = f"{e.response.status_code}: "
            try:
                # Attempt to get error message from response body
                error_detail += e.response.text[:200] # Limit length
            except Exception:
                error_detail += "(Could not read response body)"
            print(f"Error: HTTP Error on page {current_page + 1}: {error_detail}")
            # Fail completely on HTTP error
            return {"error": f"API HTTP Error on page {current_page + 1}: {error_detail}"}

        except requests.exceptions.RequestException as e:
            # Catch other potential network errors (DNS, Connection refused, etc.)
             print(f"Error: Network/Request Error on page {current_page + 1}: {e}")
             return {"error": f"API Request Failed on page {current_page + 1}: {e}"}

        except json.JSONDecodeError as e:
             # Catch errors if the response isn't valid JSON
             print(f"Error: Failed to decode JSON response on page {current_page + 1}: {e}")
             return {"error": f"API JSON Decode Error on page {current_page + 1}."}

        except Exception as e:
            # Catch any other unexpected errors during pagination
            print(f"Error: Unexpected error during pagination: {traceback.format_exc()}")
            return {"error": f"Unexpected pagination error: {e}"}

        # Optional small delay between pages if needed to respect rate limits
        # import time
        # time.sleep(0.25) # Sleep for 250ms

    # Check if max pages limit was hit before fetching all results
    if current_page >= max_pages:
         print(f"Warning: Reached maximum page limit ({max_pages}). Results might be incomplete.")
         # Consider returning a specific status or flag indicating partial results due to max pages

    print(f"Finished fetch. Total vulnerabilities retrieved: {len(all_vulnerabilities)}")
    return {"vulnerabilities": all_vulnerabilities}


# --- Single Endpoint Handler ---
# Vercel routes requests for /api/stix_poc to this Flask app.
# The Flask routes handle paths *relative* to that base.
@app.route('/', defaults={'path': ''}) # Catches requests to /api/stix_poc
@app.route('/<path:path>')             # Catches requests to /api/stix_poc/*
def handler(path):
    """
    Handles GET requests to /api/stix_poc.
    Fetches vulnerability data from Flashpoint based on fixed criteria,
    maps it to STIX 2.1 format, and returns the STIX Bundle as JSON.
    """
    # This function is mapped by Vercel routing, method check might be redundant
    # but good for clarity and preventing accidental POSTs etc.
    if request.method != 'GET':
        print(f"Warning: Received non-GET request ({request.method}) to handler.")
        return jsonify({"status": "error", "message": "Method not allowed"}), 405

    # Check for essential configuration on each request
    if not FP_API_KEY or not FP_VULN_API_URL:
         print("ERROR: API Key/URL not configured in Vercel environment.")
         # Return 500 Internal Server Error for configuration issues
         return jsonify({"status": "error", "message": "Server configuration error."}), 500

    print(f"[{datetime.now(timezone.utc).isoformat()}] Vercel Function: Received request to generate POC bundle...")

    # --- Define API query parameters ---
    # Using fixed parameters for this specific POC endpoint
    params = {
        "published_after": "-14d", # Vulnerabilities published in the last 14 days
        "exploit": "public",       # Only those with public exploits
        # Multiple solutions passed as a comma-separated string
        "solution": "change_default,patch,upgrade,workaround",
        "location": "remote"       # Remotely exploitable
    }
    print(f"Using fixed filter parameters: {params}")

    # --- Fetch Data ---
    fetch_result = get_all_flashpoint_vulnerabilities(params)
    if "error" in fetch_result:
        # Propagate error from the fetch helper
        print(f"Error during vulnerability fetch: {fetch_result['error']}")
        # Return 500 for upstream API errors or fetch issues
        return jsonify({"status": "error", "message": fetch_result["error"]}), 500

    vulnerabilities = fetch_result.get("vulnerabilities", [])

    # --- Handle No Results ---
    if not vulnerabilities:
        print("No vulnerabilities found matching the specified criteria.")
        # Return 200 OK with an empty STIX bundle (valid STIX structure)
        try:
            empty_bundle = Bundle(objects=[TLP_WHITE_DEFINITION], allow_custom=True)
            empty_json = empty_bundle.serialize(indent=2)
            return Response(empty_json, mimetype='application/json', status=200)
        except Exception as e:
             print(f"Error creating empty bundle: {traceback.format_exc()}")
             return jsonify({"status": "error", "message": f"Failed to create empty bundle: {e}"}), 500

    print(f"Found {len(vulnerabilities)} matching vulnerabilities. Converting to STIX...")

    # --- Map to STIX ---
    all_stix_objects = []
    conversion_errors = 0
    processed_count = 0
    for vuln_data in vulnerabilities:
        try:
            # Pass each vulnerability JSON object to the mapper
            stix_objs_for_vuln = map_flashpoint_vuln_to_stix(vuln_data) # Returns a list
            all_stix_objects.extend(stix_objs_for_vuln)
            processed_count += 1
        except Exception as map_err:
            conversion_errors += 1
            vuln_id_err = vuln_data.get('id', 'UNKNOWN_ID') # Get ID for logging if possible
            # Log the specific error and traceback for the failed mapping
            print(f"Error mapping vulnerability ID {vuln_id_err}: {map_err}")
            print(traceback.format_exc()) # Print full traceback for debugging

    print(f"STIX conversion completed.")
    print(f" - Processed: {processed_count} vulnerabilities")
    print(f" - Generated: {len(all_stix_objects)} STIX objects")
    print(f" - Errors: {conversion_errors} during mapping")

    # Handle case where mapping fails for all items or produces no objects
    if not all_stix_objects and vulnerabilities:
        err_msg = f"Mapping process failed or resulted in zero STIX objects, despite finding {len(vulnerabilities)} vulnerabilities."
        if conversion_errors > 0:
            err_msg += f" Encountered {conversion_errors} mapping errors (check logs)."
        print(f"Error: {err_msg}")
        # Return 500 as something went wrong in the core logic
        return jsonify({"status": "error", "message": err_msg}), 500

    # --- Bundle & Return STIX JSON ---
    try:
        # Create the final STIX Bundle, including the TLP:WHITE marking definition
        # Ensure TLP_WHITE_DEFINITION is added only once
        final_objects = all_stix_objects + [TLP_WHITE_DEFINITION]
        final_bundle = Bundle(objects=final_objects, allow_custom=True)

        # Serialize the bundle to a JSON string with indentation
        bundle_json = final_bundle.serialize(indent=2)

        print(f"[{datetime.now(timezone.utc).isoformat()}] Successfully generated bundle with {len(all_stix_objects)} primary objects.")
        # Return the STIX bundle directly as the response body
        # Use Flask's Response object for proper headers and status
        return Response(bundle_json, mimetype='application/json', status=200)

    except Exception as e:
        # Catch errors during final bundle creation or serialization
        print(f"Error creating final STIX bundle: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": f"Failed to create final bundle: {e}"}), 500

# --- Vercel Execution Context ---
# The Flask development server (`app.run()`) is NOT needed or used when deploying to Vercel.
# Vercel uses a WSGI server to interact with the 'app' object directly.
# if __name__ == '__main__':
#     # This block is useful for local testing only (e.g., python api/stix_poc.py)
#     # Ensure environment variables are loaded for local testing (e.g., from a .env file)
#     # from dotenv import load_dotenv
#     # load_dotenv()
#     print("Starting Flask development server for local testing...")
#     # Use host='0.0.0.0' to make accessible on network, port can be anything not in use
#     app.run(debug=True, port=5001, host='0.0.0.0')