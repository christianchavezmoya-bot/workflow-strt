import sqlite3
import os
import json
import requests

db_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'Commtrac.Api', 'commtrac.db')

# First, let's check the database directly
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== VERIFYING FIX FOR TECHNICIAN WORKLOAD ===\n")

# Find Steven Rutherford (PM)
cur.execute("SELECT Id, FullName, Email FROM Users WHERE FullName LIKE '%Steven%Rutherford%'")
steven = cur.fetchone()
print(f"PM: {steven['FullName']} (ID: {steven['Id']})")
print(f"Email: {steven['Email']}")
steven_id = steven['Id']

# Find Christian Chavez
cur.execute("SELECT Id, FullName FROM Users WHERE FullName LIKE '%Christian%Chavez%'")
christian = cur.fetchone()
christian_id = christian['Id'] if christian else None
print(f"\nInstaller: {christian['FullName'] if christian else 'Not found'} (ID: {christian_id})")

# Get projects managed by Steven
cur.execute("SELECT Id, JobNumber, CustomerName, Status FROM Projects WHERE ProjectManager = ?", (steven['FullName'],))
projects = cur.fetchall()
print(f"\n=== Projects managed by Steven ({len(projects)} projects) ===")
for p in projects:
    print(f"  {p['JobNumber']} - {p['CustomerName']} (Status: {p['Status']})")

project_ids = [p['Id'] for p in projects]

# Get active assets in Steven's projects assigned to Christian
print(f"\n=== Active Assets Assigned to Christian Chavez in Steven's Projects ===")
placeholders = ','.join(['?' for _ in project_ids])
cur.execute(f"""
    SELECT pa.Id, pa.AssetTag, pa.AssetName, pa.Status, pa.AssignedUserId, pa.ProjectId, p.JobNumber,
           u.FullName as AssignedUserName
    FROM ProjectAssets pa
    JOIN Projects p ON pa.ProjectId = p.Id
    LEFT JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE pa.ProjectId IN ({placeholders})
    AND pa.AssignedUserId = ?
    AND pa.Status != 'Complete' AND pa.Status != 'Completed' AND pa.Status != 'Cancelled'
    ORDER BY p.JobNumber, pa.AssetTag
""", project_ids + [christian_id])
christian_assets = cur.fetchall()
print(f"Total active assets for Christian: {len(christian_assets)}")
for a in christian_assets:
    print(f"  {a['JobNumber']}: {a['AssetTag']} - Status: {a['Status']}")

# Get workflow runs for these assets
print(f"\n=== Workflow Runs for Christian's Assets ===")
asset_ids = [a['Id'] for a in christian_assets]
runs_by_asset = {}
if asset_ids:
    placeholders = ','.join(['?' for _ in asset_ids])
    cur.execute(f"""
        SELECT r.Id, r.AssetId, r.Status, r.StartedAt, r.UpdatedAt,
               pa.AssetTag, p.JobNumber
        FROM AssetWorkflowRuns r
        JOIN ProjectAssets pa ON r.AssetId = pa.Id
        JOIN Projects p ON pa.ProjectId = p.Id
        WHERE r.AssetId IN ({placeholders})
        ORDER BY r.UpdatedAt DESC
    """, asset_ids)
    runs = cur.fetchall()
    
    # Group by asset
    for r in runs:
        if r['AssetId'] not in runs_by_asset:
            runs_by_asset[r['AssetId']] = []
        runs_by_asset[r['AssetId']].append(r)
    
    for asset_id, asset_runs in runs_by_asset.items():
        latest = asset_runs[0]  # Most recent
        asset = next((a for a in christian_assets if a['Id'] == asset_id), None)
        print(f"  {latest['JobNumber']}: {latest['AssetTag']}")
        print(f"    Asset Status: {asset['Status'] if asset else 'Unknown'}")
        print(f"    Latest Run Status: {latest['Status']}")
        print(f"    All runs: {[r['Status'] for r in asset_runs]}")

# Calculate expected counts using the NEW logic
print(f"\n=== EXPECTED COUNTS (with fix) ===")
paused_count = 0
in_progress_count = 0
not_started_count = 0

for a in christian_assets:
    asset_status = (a['Status'] or '').strip().lower().replace(' ', '')
    asset_id = a['Id']
    
    # Get latest run status
    run_status = ''
    if asset_id in runs_by_asset and runs_by_asset[asset_id]:
        run_status = (runs_by_asset[asset_id][0]['Status'] or '').strip().lower().replace(' ', '')
    
    # Apply the NEW logic: Paused → In Progress → Issue → Pending → Not Started
    if run_status == 'paused':
        paused_count += 1
        print(f"  {a['AssetTag']}: PAUSED (runStatus={run_status})")
    elif run_status == 'inprogress' or asset_status == 'inprogress':
        in_progress_count += 1
        print(f"  {a['AssetTag']}: IN PROGRESS (runStatus={run_status}, assetStatus={asset_status})")
    elif asset_status == 'issue':
        in_progress_count += 1
        print(f"  {a['AssetTag']}: IN PROGRESS (issue status = active)")
    elif asset_status == 'pending':
        not_started_count += 1
        print(f"  {a['AssetTag']}: QUEUED (pending status)")
    elif asset_status == 'notstarted':
        not_started_count += 1
        print(f"  {a['AssetTag']}: QUEUED (not started)")
    else:
        print(f"  {a['AssetTag']}: UNHANDLED (runStatus={run_status}, assetStatus={asset_status})")

print(f"\n=== EXPECTED WORKLOAD FOR CHRISTIAN CHAVEZ ===")
print(f"  Active (in progress): {in_progress_count}")
print(f"  Paused: {paused_count}")
print(f"  Queued (not started): {not_started_count}")
print(f"  Total: {len(christian_assets)}")

# Now test the API endpoint
print(f"\n=== TESTING API ENDPOINT ===")
base_url = "http://localhost:4000"
try:
    # Login as Steven to get a token
    login_response = requests.post(f"{base_url}/api/auth/login", json={
        "email": "Steven.Rutherford@strataworldwide.com",
        "password": "Steven123!"
    }, timeout=5)
    
    if login_response.status_code == 200:
        token = login_response.json().get('token') or login_response.json().get('accessToken')
        if token:
            print("Login successful, fetching workload...")
            headers = {"Authorization": f"Bearer {token}"}
            
            # Get technician workload summary
            workload_response = requests.get(f"{base_url}/api/project-assets/technician-workload-summary", headers=headers, timeout=5)
            
            if workload_response.status_code == 200:
                workload_data = workload_response.json()
                print(f"\nAPI returned {len(workload_data)} technicians")
                
                # Find Christian in the response
                christian_api = next((w for w in workload_data if w.get('userId') == christian_id), None)
                if christian_api:
                    print(f"\n=== API RESPONSE FOR CHRISTIAN CHAVEZ ===")
                    print(f"  Name: {christian_api.get('fullName')}")
                    print(f"  Active (in progress): {christian_api.get('inProgress')}")
                    print(f"  Paused: {christian_api.get('paused')}")
                    print(f"  Queued (not started): {christian_api.get('notStarted')}")
                    print(f"  Total: {christian_api.get('totalAssigned')}")
                    
                    # Compare
                    print(f"\n=== COMPARISON ===")
                    match_active = "MATCH" if in_progress_count == christian_api.get('inProgress') else "MISMATCH"
                    match_paused = "MATCH" if paused_count == christian_api.get('paused') else "MISMATCH"
                    match_queued = "MATCH" if not_started_count == christian_api.get('notStarted') else "MISMATCH"
                    print(f"  Expected Active: {in_progress_count} | API: {christian_api.get('inProgress')} | {match_active}")
                    print(f"  Expected Paused: {paused_count} | API: {christian_api.get('paused')} | {match_paused}")
                    print(f"  Expected Queued: {not_started_count} | API: {christian_api.get('notStarted')} | {match_queued}")
                else:
                    print(f"Christian Chavez not found in API response")
                    print(f"Available user IDs: {[w.get('userId') for w in workload_data]}")
            else:
                print(f"Failed to get workload: {workload_response.status_code}")
                print(workload_response.text[:500])
        else:
            print(f"No token in login response: {login_response.json()}")
    else:
        print(f"Login failed: {login_response.status_code}")
        print(login_response.text[:500])
except requests.exceptions.ConnectionError:
    print("Could not connect to API server. Is it running?")
except Exception as e:
    print(f"Error: {e}")

conn.close()