# Reference Fields - Quick Start Guide

## 🚀 What You Need to Know in 2 Minutes

**Reference fields** link tables together so data stays consistent.

### Quick Example

**Before:** Manually typing customer names (prone to typos)
```
Projects Table:
- Customer: "Acme Corp"
- Customer: "Acme Corporation"  ← Different spellings!
- Customer: "ACME"              ← Inconsistent!
```

**After:** Using reference field (always correct)
```
Projects Table:
- Customer: [Dropdown] → Acme Corporation ✓
                      → Beta Industries  ✓
                      → Gamma Tech       ✓
```

---

## ⚡ Create in 30 Seconds

1. Click **⚙️ Settings** on any table
2. Under "Create new field":
   - **Name**: `Customer Name`
   - **Type**: `reference`
   - **Link to**: `field-customer`
   - **Action**: `open referenced record`
3. Click **Create**

Done! Now you have a dropdown with validated customer names.

---

## 🎯 Common Use Cases

### 1. Customer References
```
Use in: Projects, Installations, Issues
Links to: Customers table
Ensures: Consistent customer names everywhere
```

### 2. Site Location References
```
Use in: Installations, Service Calls
Links to: Sites table (filtered by customer)
Ensures: Valid site addresses only
```

### 3. Product Selection
```
Use in: Projects, Orders, Inventory
Links to: Products table
Ensures: Only approved products selected
```

### 4. User Assignment
```
Use in: Tasks, Issues, Projects
Links to: Users table
Ensures: Assigned to actual users only
```

---

## 📋 Actions Explained

| Action | What It Does | When to Use |
|--------|-------------|-------------|
| **open referenced record** | Opens detail view | View full info |
| **filter by reference** | Filters current view | Find related items |
| **navigate to reference** | Goes to related page | Manage records |

---

## ✅ Quick Wins

**Immediate Benefits:**
- ✓ No more typos in customer/product names
- ✓ Dropdown shows all valid options
- ✓ Can't select non-existent records
- ✓ Click to view related details
- ✓ Update once, changes everywhere

**Example:** Change customer name from "Acme Corp" to "Acme Corporation" → All 47 projects update automatically ✨

---

## 🔗 Linking Guide

### What Can Be Linked?

Reference fields can link to:
- ✅ Primary keys (`field-customer`, `field-job-number`)
- ✅ Composite keys (multi-part identifiers)
- ✅ Other lookup fields

### Can't Link To:
- ❌ Regular text fields
- ❌ Number fields
- ❌ Date fields

**Solution:** Create a primary key field in the source table first.

---

## 🎨 Real Example: Sites Feature

**Scenario:** Link Installations to actual Customer Sites

### Step 1: Create Reference Field in Installations
```
Name: "Site Location"
Type: "reference"
Link to: "Sites table primary key"
Action: "navigate to reference"
```

### Step 2: Use It
When creating an Installation:
1. Select Customer (first reference field)
2. Select Site (shows only that customer's sites) ← Filtered!
3. Site validated against real data ✓

### Result
- Can't enter fake sites
- Sites match customer records
- Click to manage site details

---

## 🐛 Troubleshooting in 10 Seconds

**Problem:** Dropdown is empty
**Fix:** Add records to the source table first

**Problem:** Can't select "Link to"
**Fix:** Make sure field type is "reference"

**Problem:** Options not filtered
**Fix:** Coming soon! For now, shows all options

---

## 💡 Pro Tips

1. **Name Clearly**
   - Good: "Customer Site Location"
   - Bad: "Ref1", "Field"

2. **Start Simple**
   - First: Link Projects → Customers
   - Then: Link Installations → Sites
   - Advanced: Multi-level cascading

3. **Test First**
   - Create field
   - Add test record
   - Verify dropdown works
   - Then roll out

4. **Document Your Links**
   ```
   Projects → Customers
   Installations → Sites → Customers
   Issues → Installations → Sites → Customers
   ```

---

## 📚 Next Steps

1. ✅ **Try it now**: Create your first reference field
2. 📖 **Read full guide**: See `REFERENCE_FIELDS_GUIDE.md`
3. 🔧 **Advanced features**: Coming in next update

---

## 🎓 Learning Path

### Beginner (Start Here)
- [ ] Create Customer reference in Projects
- [ ] Test the dropdown
- [ ] Click to open customer record

### Intermediate
- [ ] Add Site reference in Installations
- [ ] Set up "navigate to reference" action
- [ ] Create cascading references (Customer → Site)

### Advanced
- [ ] Use references in formulas
- [ ] Implement conditional filtering
- [ ] Build multi-level hierarchies

---

## 📞 Need Help?

- **Full Documentation**: `docs/REFERENCE_FIELDS_GUIDE.md`
- **Examples**: Check existing tables for reference field examples
- **Support**: Contact your system administrator

---

**Remember:** Reference fields = Dropdowns with validation ✓

Start using them today to keep your data clean and consistent!
