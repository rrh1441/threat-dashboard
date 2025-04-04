# /api/stix_poc.py (Vercel Serverless Function using Flask)

import os
import requests
import json
import traceback
from flask import Flask, Response, jsonify, request  # Added request import
from datetime import datetime, timezone, timedelta

# --- IMPORTANT: Ensure stix_mapper.py is in this SAME /api directory ---
try:
    from stix_mapper import map_flashpoint_vuln_to_stix, TLP_WHITE_DEFINITION
except ImportError as e:
    print(f"CRITICAL ERROR: Cannot import stix_mapper: {e}. Ensure stix_mapper.py exists in the /api directory.")
    # Define dummy function so Flask app can load, but endpoint will fail clearly
    def map_flashpoint_vuln_to_stix(data): raise RuntimeError("stix_mapper not found")
    TLP_WHITE_DEFINITION = {"id": "error-marking-def-not-found"} # Dummy object

from stix2 import Bundle

# --- Environment Variables (Set in Vercel Project Settings) ---
FP_API_KEY = os.environ.get('FP_API_KEY')
FP_VULN_API_URL = os.environ.get('FP_VULN_API_URL')
FP_API_PAGE_SIZE = int(os.environ.get('FP_API_PAGE_SIZE', 500)) # Default 500

# --- Flask App for Vercel ---
# Vercel's Python runtime looks for a WSGI 'app' variable
app = Flask(__name__)
# CORS is generally not needed when called via Vercel's routing from the same deployment

# --- API Helper Function with Pagination ---
def get_all_flashpoint_vulnerabilities(params):
    """Queries the Flashpoint API with pagination to get ALL matching vulnerabilities."""
    if not FP_API_KEY:
        return {"error": "FP_API_KEY not configured."}
    if not FP_VULN_API_URL:
        return {"error": "FP_VULN_API_URL not configured."}
    
    headers = {"Authorization": f"Bearer {FP_API_KEY}", "Accept": "application/json"}
    api_url = f"{FP_VULN_API_URL}/vulnerabilities"
    all_vulnerabilities = []
    current_page = 0
    page_size = FP_API_PAGE_SIZE
    total_hits = None
    max_pages = 100
    
    print(f"Starting fetch. URL: {api_url}, Params: {params}")
    
    while True:
        page_params = params.copy()
        page_params['from'] = current_page * page_size
        page_params['size'] = page_size
        print(f"Querying page {current_page + 1} (size={page_size})...")
        response = None
        
        try:
            # Vercel functions have their own timeout (maxDuration), requests timeout should be shorter
            response = requests.get(api_url, headers=headers, params=page_params, timeout=60) # 60s timeout per API page request
            response.raise_for_status()
            data = response.json()
            # Optional: print(f"-> Raw API Response (Page {current_page + 1}): {json.dumps(data, indent=2)}")
            
            page_vulnerabilities = data.get('results', None) # Use 'results' key
            if page_vulnerabilities is None:
                page_vulnerabilities = data.get('data', [])
            if not isinstance(page_vulnerabilities, list):
                page_vulnerabilities = []
                
            all_vulnerabilities.extend(page_vulnerabilities)
            
            if total_hits is None: # Parse total hits robustly
                raw_total = data.get('total_hits', data.get('total', None))
                total_hits_val = None
                if isinstance(raw_total, dict):
                    total_hits_val = raw_total.get('value')
                elif isinstance(raw_total, (int, str)):
                    total_hits_val = raw_total
                
                if total_hits_val is not None:
                    try:
                        total_hits = int(total_hits_val)
                        print(f"Total potential hits: {total_hits}")
                    except (ValueError, TypeError):
                        total_hits = None
                        print(f"Warn: Bad total hits '{total_hits_val}'")
                else:
                    total_hits = None
                    print("Warn: Total hits not found.")
            
            num_returned = len(page_vulnerabilities)
            print(f"-> Got {num_returned} results.")
            
            # Stop conditions
            if total_hits == 0:
                break
            if total_hits is not None and len(all_vulnerabilities) >= total_hits:
                break
            if data.get("next") is None and num_returned > 0:
                break # Stop if API says no more pages explicitly
            if num_returned < page_size:
                break # Stop if last page was not full
            if current_page >= max_pages - 1:
                print(f"Warn: Max pages ({max_pages}) reached.")
                break
                
            current_page += 1
            
        except requests.exceptions.Timeout:
            error_msg = f"API Timeout querying Flashpoint page {current_page + 1}."
            print(f"Error: {error_msg}")
            return {"error": error_msg}
        except requests.exceptions.HTTPError as e:
            error_detail = f"{e.response.status_code}: "
            try:
                error_detail += e.response.text[:200]
            except Exception:
                error_detail += "(No body)"
            print(f"Error: HTTP Error page {current_page + 1}: {error_detail}")
            return {"error": f"API HTTP Error page {current_page + 1}: {error_detail}"}
        except Exception as e:
            print(f"Error: Unexpected pagination error: {traceback.format_exc()}")
            return {"error": f"Unexpected pagination error: {e}"}
    
    print(f"Total vulnerabilities fetched: {len(all_vulnerabilities)}")
    return {"vulnerabilities": all_vulnerabilities}

# --- Single Endpoint Handler ---
# Vercel maps file api/stix_poc.py -> route /api/stix_poc
# Flask handles requests to the root path ('/') RELATIVE to the function's route
@app.route('/', defaults={'path': ''}) # Catch requests to /api/stix_poc
@app.route('/<path:path>') # Also catch /api/stix_poc/* just in case
def handler(path):
    """Generates STIX bundle on demand and returns it directly."""
    # Only allow GET requests for this POC endpoint
    if request.method != 'GET':
        return jsonify({"status": "error", "message": "Method not allowed"}), 405

    if not FP_API_KEY or not FP_VULN_API_URL:
         print("ERROR: API Key/URL not configured in Vercel environment.")
         return jsonify({"status": "error", "message": "Server configuration error."}), 500

    print(f"[{datetime.now()}] Vercel Function: Received request to generate POC bundle...")
    # --- Use the multi-value solution filter that worked locally ---
    params = { "published_after": "-14d", "exploit": "public", "solution": "change_default,patch,upgrade,workaround", "location": "remote" }
    print(f"Using filter parameters: {params}")

    # --- Fetch ---
    result = get_all_flashpoint_vulnerabilities(params)
    if "error" in result:
        print(f"Error during fetch: {result['error']}")
        return jsonify({"status": "error", "message": result["error"]}), 500

    # --- Map ---
    vulnerabilities = result.get("vulnerabilities", [])
    if not vulnerabilities:
        print("No vulnerabilities found matching criteria.")
        # Return an empty bundle (valid STIX)
        empty_bundle = Bundle(objects=[TLP_WHITE_DEFINITION], allow_custom=True)
        return Response(empty_bundle.serialize(indent=2), mimetype='application/json', status=200)

    print(f"Found {len(vulnerabilities)}. Converting to STIX...")
    all_stix_objects = []
    conversion_errors = 0
    for vuln_data in vulnerabilities:
        try:
            stix_objs_for_vuln = map_flashpoint_vuln_to_stix(vuln_data)
            all_stix_objects.extend(stix_objs_for_vuln)
        except Exception as map_err:
            conversion_errors += 1
            vuln_id_err = vuln_data.get('id', 'UNKNOWN')
            print(f"Error mapping ID {vuln_id_err}: {map_err}\n{traceback.format_exc()}")

    print(f"Conversion done. Generated {len(all_stix_objects)} objects. {conversion_errors} errors.")

    if not all_stix_objects and vulnerabilities:
        err_msg = f"Mapping failed or resulted in zero STIX objects ({conversion_errors} errors)."
        print(f"Error: {err_msg}")
        return jsonify({"status": "error", "message": err_msg}), 500

    # --- Bundle & Return ---
    try:
        final_bundle = Bundle(objects=all_stix_objects + [TLP_WHITE_DEFINITION], allow_custom=True)
        bundle_json = final_bundle.serialize(indent=2)
        print(f"[{datetime.now()}] Successfully generated bundle ({len(all_stix_objects)} objs), returning directly.")
        # Use Flask Response to set mimetype and status correctly
        return Response(bundle_json, mimetype='application/json', status=200)
    except Exception as e:
        print(f"Error creating final bundle: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": f"Failed to create final bundle: {e}"}), 500

# Note: No app.run() needed for Vercel deployment