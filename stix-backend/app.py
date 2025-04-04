# app.py (FINAL: Corrected SyntaxError in HTTPError handling AND restored multi-value 'solution')

import os
import requests
import json
import math
import traceback
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime, timezone

# Import from stix_mapper and stix2
from stix_mapper import map_flashpoint_vuln_to_stix, TLP_WHITE_DEFINITION
from stix2 import Bundle

# Load environment variables
from dotenv import load_dotenv
load_dotenv()
FP_API_KEY = os.environ.get('FP_API_KEY')
FP_VULN_API_URL = os.environ.get('FP_VULN_API_URL')
FP_API_PAGE_SIZE = int(os.environ.get('FP_API_PAGE_SIZE', 500))

# Configuration
STIX_BUNDLE_DIR = "data"
STIX_BUNDLE_FILENAME = "latest_stix_bundle.json"
STIX_BUNDLE_PATH = os.path.join(STIX_BUNDLE_DIR, STIX_BUNDLE_FILENAME)

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "https://your-nextjs-production-domain.com"]}}) # Adjust origins
os.makedirs(STIX_BUNDLE_DIR, exist_ok=True)


# --- API Helper Function with Pagination ---
def get_all_flashpoint_vulnerabilities(params):
    """Queries the Flashpoint API with pagination to get ALL matching vulnerabilities."""
    if not FP_API_KEY: return {"error": "FP_API_KEY not configured in backend environment."}
    if not FP_VULN_API_URL: return {"error": "FP_VULN_API_URL not configured in backend environment."}

    headers = {"Authorization": f"Bearer {FP_API_KEY}", "Accept": "application/json"}
    api_url = f"{FP_VULN_API_URL}/vulnerabilities"
    all_vulnerabilities = []
    current_page = 0
    page_size = FP_API_PAGE_SIZE
    total_hits = None
    max_pages = 100

    print(f"Starting vulnerability fetch. Base URL: {api_url}, Initial Params: {params}")

    while True:
        page_params = params.copy()
        page_params['from'] = current_page * page_size
        page_params['size'] = page_size
        print(f"Querying page {current_page + 1}... (from={page_params['from']}, size={page_params['size']})")

        try:
            response = requests.get(api_url, headers=headers, params=page_params, timeout=90)
            print(f"-> Request URL: {response.url}")
            response.raise_for_status()
            data = response.json()
            # print(f"-> Raw API Response (Page {current_page + 1}): {json.dumps(data, indent=2)}") # Keep commented unless needed

            # Use 'results' key logic
            page_vulnerabilities = data.get('results', None)
            if page_vulnerabilities is None:
                 page_vulnerabilities = data.get('data', [])
                 if not isinstance(page_vulnerabilities, list):
                      hits_data = data.get('hits', {})
                      if isinstance(hits_data, dict): page_vulnerabilities = hits_data.get('hits', [])
                      if not isinstance(page_vulnerabilities, list):
                           print(f"Error: Could not find vulnerability list under 'results', 'data', or 'hits.hits'. Keys: {list(data.keys())}")
                           return {"error": "Unexpected API response structure: results list key not found."}
            elif not isinstance(page_vulnerabilities, list):
                 print(f"Error: Expected a list for 'results' key, got {type(page_vulnerabilities)}. Keys: {list(data.keys())}")
                 return {"error": "Unexpected API response structure: 'results' key did not contain a list."}

            all_vulnerabilities.extend(page_vulnerabilities)

            # Robust total_hits extraction
            if total_hits is None:
                raw_total = data.get('total_hits', data.get('total', None)); total_hits_val = None
                if isinstance(raw_total, dict): total_hits_val = raw_total.get('value')
                elif isinstance(raw_total, (int, str)): total_hits_val = raw_total
                if total_hits_val is not None:
                    try: total_hits = int(total_hits_val); print(f"Total potential hits: {total_hits}")
                    except (ValueError, TypeError): total_hits = None; print(f"Warn: Bad total hits '{total_hits_val}'")
                else: total_hits = None; print("Warn: Total hits not found.")

            num_returned = len(page_vulnerabilities)
            print(f"-> Got {num_returned} results on this page.")

            # Stop conditions
            if total_hits == 0: break
            if total_hits is not None and len(all_vulnerabilities) >= total_hits: break
            if data.get("next") is None and num_returned > 0: break
            if num_returned < page_size: break
            if current_page >= max_pages -1 : print(f"Warn: Max pages reached."); break
            current_page += 1

        except requests.exceptions.Timeout:
             error_msg = f"API Timeout page {current_page + 1}."; print(f"Error: {error_msg}"); return {"error": error_msg}
        # --- *** SYNTAX CORRECTED HTTPError Handling *** ---
        except requests.exceptions.HTTPError as e:
             error_detail = f"{e.response.status_code}: " # Get status code first
             try:
                  # Try appending response text on separate lines inside try block
                  error_detail += e.response.text[:500] # Limit error text length
             except Exception:
                  error_detail += "(Could not read response body)"
             # Ensure print and return are outside the inner try/except, but inside the outer except
             print(f"Error: HTTP Error on page {current_page + 1}: {error_detail}")
             return {"error": f"API HTTP Error on page {current_page + 1}: {error_detail}"}
        # --- *** End Correction *** ---
        except requests.exceptions.RequestException as e: print(f"Error: Network/Request Error on page {current_page + 1}: {e}"); return {"error": f"API Request Failed on page {current_page + 1}: {e}"}
        except json.JSONDecodeError as e: print(f"Error: Failed to decode JSON on page {current_page + 1}: {e}"); return {"error": f"API JSON Decode Error on page {current_page + 1}."}
        except Exception as e: print(f"Error: Unexpected error during pagination: {traceback.format_exc()}"); return {"error": f"Unexpected error during pagination: {e}"}

    print(f"Total vulnerabilities fetched: {len(all_vulnerabilities)}")
    return {"vulnerabilities": all_vulnerabilities}


# --- API Endpoints ---

@app.route('/api/generate_test_bundle', methods=['POST'])
def generate_test_bundle_api():
    """API endpoint to trigger bundle generation using fixed criteria."""
    print(f"[{datetime.now()}] Received API request to generate test bundle...")

    # --- Parameters with multi-value solution restored ---
    params = {
        "published_after": "-14d",
        "exploit": "public",
        "solution": "change_default,patch,upgrade,workaround", # Restored full list
        "location": "remote"
    }
    # --- End Parameters ---

    print(f"Using filter parameters: {params}") # Log the exact params being used

    result = get_all_flashpoint_vulnerabilities(params)
    if "error" in result:
        print(f"Error during fetch: {result['error']}")
        return jsonify({"status": "error", "message": result["error"]}), 500

    vulnerabilities = result.get("vulnerabilities", [])
    if not vulnerabilities:
        print("No vulnerabilities found matching criteria with current filters.")
        return jsonify({"status": "warning", "message": "No vulnerabilities found matching the specified criteria."}), 200

    print(f"Found {len(vulnerabilities)} matching vulnerabilities. Converting to STIX...")
    # (Rest of STIX conversion, bundling, saving logic remains the same)
    all_stix_objects = []
    processed_count = 0; conversion_errors = 0
    for vuln_data in vulnerabilities:
        try:
            stix_objs_for_vuln = map_flashpoint_vuln_to_stix(vuln_data)
            all_stix_objects.extend(stix_objs_for_vuln)
            processed_count += 1
        except Exception as map_err: conversion_errors += 1; vuln_id_err = vuln_data.get('id', 'UNKNOWN'); print(f"Error mapping ID {vuln_id_err}: {map_err}\n{traceback.format_exc()}")
    print(f"Processed {processed_count} vulnerabilities. Generated {len(all_stix_objects)} STIX objects. Encountered {conversion_errors} mapping errors.")
    if not all_stix_objects:
        err_msg = "No STIX objects generated despite finding vulnerabilities.";
        if conversion_errors > 0: err_msg += f" Check logs for {conversion_errors} mapping errors."
        else: err_msg += " Check mapping logic or source data structure."
        print(f"Warning: {err_msg}"); return jsonify({"status": "warning", "message": err_msg}), 200
    try:
        bundle = Bundle(objects=all_stix_objects + [TLP_WHITE_DEFINITION], allow_custom=True)
        bundle_json = bundle.serialize(indent=2)
        os.makedirs(STIX_BUNDLE_DIR, exist_ok=True)
        with open(STIX_BUNDLE_PATH, "w", encoding="utf-8") as f: f.write(bundle_json)
        save_msg = f"Bundle generated: {len(all_stix_objects)} objects saved ({len(vulnerabilities)} source vulns)."
        if conversion_errors > 0: save_msg += f" ({conversion_errors} mapping errors occurred - see logs)"
        print(f"[{datetime.now()}] Successfully saved STIX bundle to {STIX_BUNDLE_PATH}")
        return jsonify({"status": "success", "message": save_msg}), 200
    except Exception as e: print(f"Error creating/saving STIX bundle: {traceback.format_exc()}"); return jsonify({"status": "error", "message": f"Failed to create/save bundle: {e}"}), 500


@app.route('/api/stix_bundle.json', methods=['GET'])
def get_stix_bundle_api():
    # (Keep as before)
    print(f"[{datetime.now()}] Request received for /api/stix_bundle.json")
    if not os.path.exists(STIX_BUNDLE_PATH): print("Bundle file not found."); return jsonify({"error": "STIX bundle has not been generated yet."}), 404
    try: print(f"Serving bundle file from {STIX_BUNDLE_PATH}"); return send_from_directory( STIX_BUNDLE_DIR, STIX_BUNDLE_FILENAME, mimetype='application/json', as_attachment=False )
    except Exception as e: print(f"Error serving bundle file: {traceback.format_exc()}"); return jsonify({"error": f"Failed to serve bundle file: {e}"}), 500

# --- Run the App ---
if __name__ == '__main__':
    # (Keep checks and run command as before)
    if not FP_API_KEY: print("ERROR: FP_API_KEY must be set in .env file!")
    if not FP_VULN_API_URL: print("ERROR: FP_VULN_API_URL must be set in .env file!")
    if FP_API_KEY and FP_VULN_API_URL:
         print(f"Starting Flask API server for STIX generation...")
         # ... (rest of startup messages) ...
         app.run(debug=True, port=5001, host='127.0.0.1')
    else:
         print("Exiting due to missing environment variables.")