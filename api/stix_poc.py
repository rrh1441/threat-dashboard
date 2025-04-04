# /api/stix_poc.py (Vercel Serverless Function using Flask)
# Updated to use THREAT_API_KEY environment variable

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
# *** Use THREAT_API_KEY for the API Key ***
API_KEY = os.environ.get('THREAT_API_KEY')
# *** Still use FP_VULN_API_URL for the URL itself ***
VULN_API_URL = os.environ.get('FP_VULN_API_URL')
# Use a default page size, ensure it's an integer
try:
    API_PAGE_SIZE = int(os.environ.get('FP_API_PAGE_SIZE', 500))
except (ValueError, TypeError):
    print("Warning: Invalid FP_API_PAGE_SIZE in environment. Using default 500.")
    API_PAGE_SIZE = 500

# --- Flask App for Vercel ---
# Vercel's Python runtime looks for a WSGI 'app' variable
app = Flask(__name__)
# CORS is generally not needed when the frontend and API are served from the same Vercel deployment.

# --- API Helper Function with Pagination ---
def get_all_flashpoint_vulnerabilities(params):
    """Queries the Flashpoint Vulnerability API with pagination."""
    # *** Check the correct API_KEY variable ***
    if not API_KEY:
        print("Error: THREAT_API_KEY environment variable not set.")
        # Update error message for clarity
        return {"error": "Server configuration error: Missing API Key (THREAT_API_KEY)."}
    if not VULN_API_URL:
        print("Error: FP_VULN_API_URL environment variable not set.")
        return {"error": "Server configuration error: Missing API URL (FP_VULN_API_URL)."}

    # *** Use the correct API_KEY variable in header ***
    headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
    # Ensure the API URL doesn't have a trailing slash if adding path segment
    api_base_url = VULN_API_URL.rstrip('/')
    api_url = f"{api_base_url}/vulnerabilities"

    all_vulnerabilities = []
    current_page = 0
    page_size = API_PAGE_SIZE
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
            response = requests.get(api_url, headers=headers, params=page_params, timeout=60) # 60s timeout per page

            print(f"-> Request URL: {response.url}") # Log the exact URL queried
            response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)

            data = response.json()

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
                raw_total = data.get('total_hits', data.get('total', None)); total_hits_val = None
                if isinstance(raw_total, dict): total_hits_val = raw_total.get('value')
                elif isinstance(raw_total, (int, str)): total_hits_val = raw_total
                if total_hits_val is not None:
                    try: total_hits = int(total_hits_val); print(f"Total potential hits reported by API: {total_hits}")
                    except (ValueError, TypeError): total_hits = None; print(f"Warning: Could not parse total hits value: '{total_hits_val}'")
                else: total_hits = None; print("Warning: Total hits information not found in API response.")

            # --- Stop Conditions for Pagination ---
            if total_hits == 0: print("API reported 0 total hits. Stopping."); break
            if total_hits is not None and len(all_vulnerabilities) >= total_hits: print(f"Fetched {len(all_vulnerabilities)}/{total_hits} items. Stopping."); break
            if num_returned < page_size: print("Last page was not full. Assuming end of results."); break

            current_page += 1

        except requests.exceptions.Timeout:
            error_msg = f"API request timed out while querying Flashpoint page {current_page + 1}."
            print(f"Error: {error_msg}")
            return {"error": error_msg} # Stop processing

        except requests.exceptions.HTTPError as e:
            error_detail = f"{e.response.status_code}: "
            try: error_detail += e.response.text[:200] # Limit length
            except Exception: error_detail += "(Could not read response body)"
            print(f"Error: HTTP Error on page {current_page + 1}: {error_detail}")
            return {"error": f"API HTTP Error on page {current_page + 1}: {error_detail}"}

        except requests.exceptions.RequestException as e:
             print(f"Error: Network/Request Error on page {current_page + 1}: {e}")
             return {"error": f"API Request Failed on page {current_page + 1}: {e}"}

        except json.JSONDecodeError as e:
             print(f"Error: Failed to decode JSON response on page {current_page + 1}: {e}")
             return {"error": f"API JSON Decode Error on page {current_page + 1}."}

        except Exception as e:
            print(f"Error: Unexpected error during pagination: {traceback.format_exc()}")
            return {"error": f"Unexpected pagination error: {e}"}

    if current_page >= max_pages:
         print(f"Warning: Reached maximum page limit ({max_pages}). Results might be incomplete.")

    print(f"Finished fetch. Total vulnerabilities retrieved: {len(all_vulnerabilities)}")
    return {"vulnerabilities": all_vulnerabilities}


# --- Single Endpoint Handler ---
@app.route('/', defaults={'path': ''}) # Catches requests to /api/stix_poc
@app.route('/<path:path>')             # Catches requests to /api/stix_poc/*
def handler(path):
    """
    Handles GET requests to /api/stix_poc.
    Fetches vulnerability data from Flashpoint based on fixed criteria,
    maps it to STIX 2.1 format, and returns the STIX Bundle as JSON.
    """
    if request.method != 'GET':
        print(f"Warning: Received non-GET request ({request.method}) to handler.")
        return jsonify({"status": "error", "message": "Method not allowed"}), 405

    # *** Check correct env vars ***
    if not API_KEY or not VULN_API_URL:
         # Update error message to reflect checked variables
         print("ERROR: THREAT_API_KEY or FP_VULN_API_URL not configured in Vercel environment.")
         return jsonify({"status": "error", "message": "Server configuration error."}), 500

    print(f"[{datetime.now(timezone.utc).isoformat()}] Vercel Function: Received request to generate POC bundle...")

    # --- Define API query parameters ---
    params = {
        "published_after": "-14d",
        "exploit": "public",
        "solution": "change_default,patch,upgrade,workaround",
        "location": "remote"
    }
    print(f"Using fixed filter parameters: {params}")

    # --- Fetch Data ---
    fetch_result = get_all_flashpoint_vulnerabilities(params)
    if "error" in fetch_result:
        print(f"Error during vulnerability fetch: {fetch_result['error']}")
        return jsonify({"status": "error", "message": fetch_result["error"]}), 500

    vulnerabilities = fetch_result.get("vulnerabilities", [])

    # --- Handle No Results ---
    if not vulnerabilities:
        print("No vulnerabilities found matching the specified criteria.")
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
            stix_objs_for_vuln = map_flashpoint_vuln_to_stix(vuln_data) # Returns a list
            all_stix_objects.extend(stix_objs_for_vuln)
            processed_count += 1
        except Exception as map_err:
            conversion_errors += 1
            vuln_id_err = vuln_data.get('id', 'UNKNOWN_ID')
            print(f"Error mapping vulnerability ID {vuln_id_err}: {map_err}")
            print(traceback.format_exc())

    print(f"STIX conversion completed.")
    print(f" - Processed: {processed_count} vulnerabilities")
    print(f" - Generated: {len(all_stix_objects)} STIX objects")
    print(f" - Errors: {conversion_errors} during mapping")

    if not all_stix_objects and vulnerabilities:
        err_msg = f"Mapping process failed or resulted in zero STIX objects, despite finding {len(vulnerabilities)} vulnerabilities."
        if conversion_errors > 0: err_msg += f" Encountered {conversion_errors} mapping errors (check logs)."
        print(f"Error: {err_msg}")
        return jsonify({"status": "error", "message": err_msg}), 500

    # --- Bundle & Return STIX JSON ---
    try:
        final_objects = all_stix_objects + [TLP_WHITE_DEFINITION]
        final_bundle = Bundle(objects=final_objects, allow_custom=True)
        bundle_json = final_bundle.serialize(indent=2)

        print(f"[{datetime.now(timezone.utc).isoformat()}] Successfully generated bundle with {len(all_stix_objects)} primary objects.")
        return Response(bundle_json, mimetype='application/json', status=200)

    except Exception as e:
        print(f"Error creating final STIX bundle: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": f"Failed to create final bundle: {e}"}), 500

# --- Vercel Execution Context ---
# The Flask development server (`app.run()`) is NOT needed or used when deploying to Vercel.