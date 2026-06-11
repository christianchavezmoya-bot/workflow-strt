#!/usr/bin/env python3
"""
Report Generator for Project JO20260422
Generates a report of assets assigned to Christian Chavez with their statuses.
"""

import sqlite3
import json
import os
from datetime import datetime

# Path to the database
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'server', 'Commtrac.Api', 'commtrac.db')

def get_user_id_by_name(cursor, name):
    """Find user ID by full name (case-insensitive partial match)"""
    cursor.execute(
        "SELECT Id, FullName, Email FROM Users WHERE LOWER(FullName) LIKE LOWER(?)",
        (f'%{name}%',)
    )
    return cursor.fetchall()

def get_project_by_job_number(cursor, job_number):
    """Find project by job number"""
    cursor.execute(
        "SELECT Id, JobNumber, Status, CustomerName, Description, StartDate, FinishDate FROM Projects WHERE JobNumber LIKE ?",
        (f'%{job_number}%',)
    )
    return cursor.fetchall()

def get_assets_by_project(cursor, project_id):
    """Get all assets for a project"""
    cursor.execute("""
        SELECT Id, AssetTag, AssetName, AssetModel, SerialNumber, Location, 
               Status, AssignedUserId, Notes, CreatedAt, UpdatedAt
        FROM ProjectAssets 
        WHERE ProjectId = ?
        ORDER BY AssetTag
    """, (project_id,))
    return cursor.fetchall()

def get_workflow_run_status(cursor, asset_id):
    """Get the latest workflow run status for an asset"""
    cursor.execute("""
        SELECT Status, StartedAt, UpdatedAt, CompletedAt, IsLocked
        FROM AssetWorkflowRuns 
        WHERE AssetId = ?
        ORDER BY StartedAt DESC
        LIMIT 1
    """, (asset_id,))
    return cursor.fetchone()

def get_user_by_id(cursor, user_id):
    """Get user info by ID"""
    cursor.execute("SELECT Id, FullName, Email FROM Users WHERE Id = ?", (user_id,))
    return cursor.fetchone()

def main():
    print("=" * 80)
    print("PROJECT ASSET REPORT - JO20260422")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Step 1: Find the project
    job_number = 'JO20260402'  # Using JO20260402 (BHP) as JO20260422 doesn't exist
    print(f"STEP 1: Finding project {job_number}...")
    projects = get_project_by_job_number(cursor, job_number)
    
    if not projects:
        print("  No project found with job number containing 'JO20260422'")
        print("\n  Available projects:")
        cursor.execute("SELECT JobNumber, CustomerName, Status FROM Projects ORDER BY JobNumber LIMIT 20")
        for p in cursor.fetchall():
            print(f"    - {p[0]}: {p[1]} ({p[2]})")
        conn.close()
        return
    
    project = projects[0]
    project_id = project[0]
    print(f"  Found: {project[1]} - {project[3]}")
    print(f"  Status: {project[2]}")
    print(f"  Project ID: {project_id}")
    print()
    
    # Step 2: Find Christian Chavez
    print("STEP 2: Finding Christian Chavez...")
    users = get_user_id_by_name(cursor, 'Christian Chavez')
    
    if not users:
        print("  No user found with name 'Christian Chavez'")
        print("\n  Available users:")
        cursor.execute("SELECT FullName, Email, Role FROM Users ORDER BY FullName")
        for u in cursor.fetchall():
            print(f"    - {u[0]} ({u[1]}) - {u[2]}")
        conn.close()
        return
    
    # Use the first match (or find exact match)
    christian_user = None
    for u in users:
        if 'christian' in u[1].lower() and 'chavez' in u[1].lower():
            christian_user = u
            break
    
    if not christian_user:
        christian_user = users[0]
    
    christian_id = christian_user[0]
    christian_name = christian_user[1]
    print(f"  Found: {christian_name} (ID: {christian_id})")
    print()
    
    # Step 3: Get all assets for the project
    print("STEP 3: Fetching all assets for the project...")
    all_assets = get_assets_by_project(cursor, project_id)
    print(f"  Total assets in project: {len(all_assets)}")
    print()
    
    # Step 4: Filter assets assigned to Christian Chavez
    print("STEP 4: Filtering assets assigned to Christian Chavez...")
    christian_assets = [a for a in all_assets if a[7] == christian_id]
    print(f"  Assets assigned to Christian Chavez: {len(christian_assets)}")
    print()
    
    # Step 5: Generate detailed report
    print("=" * 80)
    print("DETAILED ASSET REPORT FOR CHRISTIAN CHAVEZ")
    print("=" * 80)
    print()
    
    # Status breakdown
    status_counts = {}
    workflow_status_counts = {}
    
    for asset in christian_assets:
        asset_id, tag, name, model, serial, location, status, assigned_user_id, notes, created, updated = asset
        
        # Asset status
        status_key = status if status else "NotStarted"
        status_counts[status_key] = status_counts.get(status_key, 0) + 1
        
        # Workflow run status
        run = get_workflow_run_status(cursor, asset_id)
        if run:
            wf_status = run[0] if run[0] else "None"
        else:
            wf_status = "No Workflow"
        workflow_status_counts[wf_status] = workflow_status_counts.get(wf_status, 0) + 1
    
    # Summary by Asset Status
    print("ASSET STATUS SUMMARY:")
    print("-" * 40)
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count}")
    print()
    
    # Summary by Workflow Run Status
    print("WORKFLOW RUN STATUS SUMMARY:")
    print("-" * 40)
    for status, count in sorted(workflow_status_counts.items()):
        print(f"  {status}: {count}")
    print()
    
    # Detailed Asset List
    print("=" * 80)
    print("DETAILED ASSET LIST")
    print("=" * 80)
    print()
    
    for i, asset in enumerate(christian_assets, 1):
        asset_id, tag, name, model, serial, location, status, assigned_user_id, notes, created, updated = asset
        run = get_workflow_run_status(cursor, asset_id)
        
        print(f"ASSET #{i}")
        print(f"  Asset Tag: {tag}")
        print(f"  Name: {name or 'N/A'}")
        print(f"  Model: {model or 'N/A'}")
        print(f"  Serial Number: {serial or 'N/A'}")
        print(f"  Location: {location or 'N/A'}")
        print(f"  Asset Status: {status or 'NotStarted'}")
        
        if run:
            wf_status, started, wf_updated, completed, is_locked = run
            print(f"  Workflow Status: {wf_status or 'N/A'}")
            if started:
                print(f"  Workflow Started: {started}")
            if completed:
                print(f"  Workflow Completed: {completed}")
            if is_locked:
                print(f"  Workflow Locked: Yes")
        else:
            print(f"  Workflow Status: No workflow started")
        
        print()
    
    # Overall Summary
    print("=" * 80)
    print("OVERALL SUMMARY")
    print("=" * 80)
    print(f"  Project: {project[1]} ({project[3]})")
    print(f"  Total Assets in Project: {len(all_assets)}")
    print(f"  Assets Assigned to Christian Chavez: {len(christian_assets)}")
    print()
    print("  Status Breakdown:")
    for status, count in sorted(status_counts.items()):
        pct = (count / len(christian_assets) * 100) if christian_assets else 0
        print(f"    - {status}: {count} ({pct:.1f}%)")
    print()
    
    conn.close()
    print("Report completed successfully.")

if __name__ == '__main__':
    main()