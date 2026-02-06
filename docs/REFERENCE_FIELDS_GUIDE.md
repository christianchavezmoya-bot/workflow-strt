# Reference Fields - User Guide

## Overview

**Reference fields** create relationships between tables, ensuring data consistency by linking records to a single source of truth. When you need data from one table to appear in another, reference fields keep everything in sync.

---

## What Are Reference Fields?

Reference fields are a special field type that:
- ✅ **Link tables together** - Connect related data across your system
- ✅ **Auto-populate** - Pull data from the source table automatically
- ✅ **Validate data** - Ensure referenced records actually exist
- ✅ **Maintain consistency** - Changes in one place update everywhere
- ✅ **Enable navigation** - Click to open related records

---

## When to Use Reference Fields

### ✅ Use Reference Fields When:

**Scenario 1: Linking Related Entities**
- Projects need to reference Customers
- Installations need to reference Sites
- Issues need to reference specific Installations

**Scenario 2: Ensuring Data Consistency**
- Customer names should match across all tables
- Product lists should come from a master catalog
- User assignments should reference actual user accounts

**Scenario 3: Creating Dropdown Lists**
- Site locations should only show sites for the selected customer
- Products should come from an approved list
- Status values should match predefined options

### ❌ Don't Use Reference Fields When:
- You just need free-text input (use "text" field)
- The data is unique to each record (use "text" or "number")
- You're creating a formula or calculation (use "formula" field)

---

## How to Create a Reference Field

### Step 1: Open Table Configuration

1. Navigate to any table (Projects, Installations, etc.)
2. Click the **⚙️ Settings icon** in the table header
3. The Table Configuration dialog opens

### Step 2: Create New Field

In the "Create new field" section:

1. **Field name**: Enter a descriptive name
   ```
   Example: "Customer Site", "Product Category", "Assigned To"
   ```

2. **Field type**: Select **"reference"** from the dropdown
   ```
   The dropdown now includes "reference" between
   "composite key" and "lookup field"
   ```

3. **Link to**: Select the source field to reference
   ```
   Options shown:
   - field-customer (primary key)
   - field-site-name (primary key)
   - field-job-number (primary key)
   - Any composite key or lookup field
   ```

4. **Action**: Choose what happens when clicked
   ```
   Options:
   - "open referenced record" - Opens the full record
   - "filter by reference" - Filters data by selection
   - "navigate to reference" - Goes to related page
   ```

5. Click **"Create"** to save the field

### Step 3: Use the Field

The reference field now appears in your table and:
- Shows a dropdown of valid options
- Validates entries against the source
- Enables the selected action on click

---

## Practical Examples

### Example 1: Link Installations to Customer Sites

**Goal**: When creating an Installation, select from the customer's actual sites

**Setup:**
```
Field name: "Installation Site"
Field type: "reference"
Link to: field-site-name (or Sites table primary key)
Action: "open referenced record"
```

**Result:**
- Dropdown shows only real customer sites
- Can't enter invalid site names
- Clicking the site opens full site details

---

### Example 2: Consistent Customer Names

**Goal**: Ensure customer names are the same in Projects and Installations

**Setup for Projects:**
```
Field name: "Customer Name"
Field type: "reference"
Link to: field-customer
Action: "navigate to reference"
```

**Setup for Installations:**
```
Field name: "Customer Name"
Field type: "reference"
Link to: field-customer
Action: "navigate to reference"
```

**Result:**
- Both tables show the same customer list
- Changes to customer names update everywhere
- Clicking customer name goes to customer details

---

### Example 3: Product Selection from Master Catalog

**Goal**: Products selected must be from approved catalog

**Setup:**
```
Field name: "Selected Product"
Field type: "reference"
Link to: field-products
Action: "open referenced record"
```

**Result:**
- Dropdown populated from Products table
- Can't add products that don't exist in catalog
- Clicking product opens product details

---

## Available Actions

When you set up a reference field, choose an action:

### 1. **Open Referenced Record**
```
What it does: Opens a detail view of the selected record
Best for: Quick access to full information
Example: Click customer name → See all customer details
```

### 2. **Filter by Reference**
```
What it does: Filters the current view based on selection
Best for: Finding related records
Example: Select customer → Show only that customer's projects
```

### 3. **Navigate to Reference**
```
What it does: Navigates to the referenced entity's page
Best for: Managing the referenced records
Example: Click "Customer Sites" → Go to Sites management page
```

---

## Field Types Comparison

| Field Type | Use Case | Example | Data Source |
|------------|----------|---------|-------------|
| **reference** | Link to other tables | Customer, Site, Product | Another table |
| **text** | Free-form text | Notes, Description | User input |
| **dropdown** | Fixed list of options | Priority, Status | Predefined list |
| **lookup field** | Complex relationships | Calculated fields | Related tables |
| **primary key** | Unique identifier | Job Number, ID | Auto-generated |

---

## Best Practices

### ✅ DO:

**1. Use Descriptive Names**
```
Good: "Installation Site Location"
Bad: "Site", "Field1", "Ref"
```

**2. Link to Primary Keys**
```
Link to fields marked as "primary key" or "composite key"
These ensure uniqueness and data integrity
```

**3. Choose Appropriate Actions**
```
Navigation: For managing related records
Open record: For viewing details
Filter: For finding related data
```

**4. Document Your References**
```
Keep track of which fields reference what
This helps when restructuring or debugging
```

### ❌ DON'T:

**1. Create Circular References**
```
Bad: Table A references B, B references C, C references A
This creates confusion and potential loops
```

**2. Reference Temporary Data**
```
Don't link to fields that change frequently
or are marked for deletion
```

**3. Over-Reference**
```
Not every field needs to be a reference
Use text fields for simple, non-critical data
```

---

## Troubleshooting

### Problem: Reference Field Not Showing Options

**Cause**: No data in the source table
**Solution**: Add records to the source table first

**Cause**: Linked to wrong field
**Solution**: Edit field → Change "Link to" selection

---

### Problem: Can't Select "Link To"

**Cause**: Field type doesn't support linking
**Solution**: Ensure field type is "reference"

**Cause**: No primary keys available
**Solution**: Create fields with type "primary key" first

---

### Problem: Action Not Working When Clicked

**Cause**: Action requires additional setup
**Solution**:
- "navigate to reference" needs a route defined
- "open referenced record" needs a detail view
- "filter by reference" needs filter configuration

---

## Migration from Existing Fields

If you have existing text fields you want to convert:

### Step 1: Create New Reference Field
- Don't delete the old field yet
- Create the new reference field alongside it

### Step 2: Test Thoroughly
- Verify dropdown shows correct options
- Check that actions work as expected
- Ensure data validates properly

### Step 3: Migrate Data (if needed)
- Map old values to new reference IDs
- Update existing records
- Verify no data loss

### Step 4: Remove Old Field
- Once confident, hide the old field
- After verification period, delete it

---

## Advanced Usage

### Cascading References

Create multi-level relationships:

```
Customer → Sites → Installations

1. Customer field (reference)
2. Site field (reference, filtered by Customer)
3. Installation field (reference, filtered by Site)
```

### Conditional Filtering

Show different options based on other field values:

```
If Office = "USA":
  Show only USA Customers
If Office = "Australia":
  Show only Australia Customers
```

*Note: Advanced filtering requires custom implementation*

---

## Reference Field Architecture

### Data Flow

```
┌─────────────┐
│  Source     │
│  Table      │  ← Master data (Customers, Sites, Products)
│  (Truth)    │
└──────┬──────┘
       │
       │ Reference Link
       │
       ↓
┌─────────────┐
│ Referencing │
│ Table       │  ← Uses data (Projects, Installations)
│ (Consumer)  │
└─────────────┘
```

### Benefits

1. **Single Source of Truth** - Update once, reflects everywhere
2. **Data Integrity** - Can't reference non-existent records
3. **Consistency** - All tables use same values
4. **Navigation** - Jump between related records
5. **Validation** - Automatic checking of data

---

## Quick Reference Card

### Creating a Reference Field

```
1. Click ⚙️ Settings icon on table
2. In "Create new field" section:
   - Name: [Descriptive name]
   - Type: "reference"
   - Link to: [Source field]
   - Action: [Choose action]
3. Click "Create"
```

### Editing a Reference Field

```
1. Click ⚙️ Settings icon on table
2. Find field in list
3. Click ✏️ Edit icon
4. Modify:
   - Name
   - Link to
   - Action
5. Click "Save"
```

### Deleting a Reference Field

```
1. Click ⚙️ Settings icon on table
2. Find field in list
3. Click 🗑️ Delete icon
4. Confirm deletion
```

---

## FAQs

**Q: Can I reference fields from multiple tables?**
A: Each reference field links to one source field. For multiple tables, create multiple reference fields.

**Q: What happens if the referenced record is deleted?**
A: The reference becomes invalid. Best practice: implement "soft deletes" or cascade deletion rules.

**Q: Can I edit the referenced data from the dropdown?**
A: No. Reference fields display existing data. To add new options, go to the source table.

**Q: Do reference fields work offline?**
A: They require data from the source table, so they need connectivity to load options.

**Q: Can I use reference fields in formulas?**
A: Yes! Reference fields can be used in calculations and formulas like any other field.

---

## Support

For additional help:
- Check the main documentation
- Review existing reference field examples in your tables
- Contact your system administrator

---

## Summary

Reference fields are powerful tools for:
- ✅ Connecting related data
- ✅ Ensuring consistency
- ✅ Validating entries
- ✅ Enabling navigation
- ✅ Maintaining data integrity

Start with simple references (like Customer names) and expand to more complex relationships as you become comfortable with the feature.

**Remember:** Reference fields link to existing data - they don't create new records. Always ensure your source tables are populated first!

---

*Last Updated: 2026-02-05*
*Feature Version: 1.0*
*System: Commtrac Workflow Management*
