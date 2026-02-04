import React, { useState, useEffect } from 'react';
import './CustomersPortal.css';

interface Site {
  name: string;
  address: string;
  status: 'Active' | 'Inactive';
}

interface Customer {
  id: number;
  name: string;
  type: string;
  logoSrc: string | null;
  sites: Site[];
}

export const CustomersPortal: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([
    { id: 101, name: "Apex Industries", type: "Manufacturing", logoSrc: null, sites: [{ name: "North Factory", address: "101 Ind Way", status: "Active" }, { name: "Warehouse A", address: "500 Log Blvd", status: "Active" }] },
    { id: 102, name: "BeeHealthy Foods", type: "Retail", logoSrc: null, sites: [{ name: "HQ Store", address: "1 Main St", status: "Active" }, { name: "West Market", address: "22 Sunset", status: "Active" }] },
    { id: 103, name: "SolarTech Energy", type: "Energy", logoSrc: null, sites: [{ name: "Solar Farm A", address: "Desert Rd", status: "Active" }, { name: "Grid Control", address: "78 Power Ln", status: "Inactive" }] },
    { id: 104, name: "Zenith Data Systems", type: "Technology", logoSrc: null, sites: [{ name: "Server Room 1", address: "45 Tech Park", status: "Active" }, { name: "Dev Hub", address: "46 Tech Park", status: "Active" }] },
    { id: 105, name: "Kappa Telecoms", type: "Technology", logoSrc: null, sites: [{ name: "Central Tower", address: "100 Signal Hill", status: "Active" }] },
    { id: 106, name: "Omega Softworks", type: "Technology", logoSrc: null, sites: [{ name: "Innovation Lab", address: "88 Silicon Ave", status: "Inactive" }, { name: "QA Center", address: "89 Silicon Ave", status: "Active" }] },
    { id: 107, name: "Delta Dental", type: "Healthcare", logoSrc: null, sites: [{ name: "Main Clinic", address: "20 Health Blvd", status: "Active" }] },
    { id: 108, name: "Pi Pharmaceuticals", type: "Healthcare", logoSrc: null, sites: [{ name: "R&D Lab Alpha", address: "50 Science Dr", status: "Active" }, { name: "Distribution", address: "51 Science Dr", status: "Active" }] },
    { id: 109, name: "Theta Care", type: "Healthcare", logoSrc: null, sites: [{ name: "Nursing Home A", address: "12 Care Ln", status: "Active" }] },
    { id: 110, name: "Lambda Financial", type: "Finance", logoSrc: null, sites: [{ name: "HQ Branch", address: "5 Wall St", status: "Active" }, { name: "Downtown ATM", address: "10 Main St", status: "Active" }] },
    { id: 111, name: "Sigma Capital", type: "Finance", logoSrc: null, sites: [{ name: "Investment Floor", address: "99 Money St", status: "Inactive" }] },
    { id: 112, name: "Phi Bank", type: "Finance", logoSrc: null, sites: [{ name: "Local Branch", address: "33 Oak St", status: "Active" }] },
    { id: 113, name: "Alpha Logistics", type: "Transport", logoSrc: null, sites: [{ name: "Dock A", address: "Harbor View", status: "Active" }, { name: "Fleet Garage", address: "1 Garage Way", status: "Active" }] },
    { id: 114, name: "Beta Shipping", type: "Transport", logoSrc: null, sites: [{ name: "Port Office", address: "Dock 4", status: "Active" }] },
    { id: 115, name: "Mu Freight", type: "Transport", logoSrc: null, sites: [{ name: "Distribution Hub", address: "Highway 9", status: "Active" }] },
    { id: 116, name: "Gamma Agritech", type: "Manufacturing", logoSrc: null, sites: [{ name: "Greenhouse 1", address: "120 Country Rd", status: "Active" }, { name: "Packing Shed", address: "121 Country Rd", status: "Active" }] },
    { id: 117, name: "Rho Education", type: "Education", logoSrc: null, sites: [{ name: "Campus North", address: "University Dr", status: "Active" }, { name: "Library", address: "University Dr", status: "Active" }] },
    { id: 118, name: "Xi Hospitality", type: "Retail", logoSrc: null, sites: [{ name: "Grand Hotel", address: "Vacation Way", status: "Active" }, { name: "Resort B", address: "Beach Blvd", status: "Active" }] }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeCustomerId, setActiveCustomerId] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [showManagementModal, setShowManagementModal] = useState(false);

  const getLogo = (customer: Customer) => {
    return customer.logoSrc || `https://picsum.photos/seed/${customer.id}/150/150`;
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().startsWith(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeCustomer = customers.find(c => c.id === activeCustomerId);

  return (
    <div className={`customers-portal ${theme}`} data-theme={theme}>
      {/* Header */}
      <header className="customers-header">
        <div className="header-title">
          <h1>Hive Portal</h1>
          <p>Manage Customers & Sites</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Dark Mode">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCustomerModal(true)}>
            ➕ New Customer
          </button>
          <button className="btn btn-outline" onClick={() => setShowManagementModal(true)}>
            ⚙️ Manage
          </button>
        </div>
      </header>

      {/* Controls Bar */}
      <div className="controls-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-wrapper">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="type-filter">
            <option value="all">All Categories</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Retail">Retail</option>
            <option value="Energy">Energy</option>
            <option value="Transport">Transport</option>
            <option value="Technology">Technology</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Finance">Finance</option>
            <option value="Education">Education</option>
          </select>
        </div>
      </div>

      {/* Main Grid */}
      <main>
        <div className="hive-grid">
          {filteredCustomers.length === 0 ? (
            <div className="empty-state">No customers found.</div>
          ) : (
            filteredCustomers.map(customer => (
              <div
                key={customer.id}
                className="customer-card"
                onClick={() => {
                  setActiveCustomerId(customer.id);
                  setShowPanel(true);
                }}
              >
                <button className="card-settings-btn" onClick={(e) => { e.stopPropagation(); setShowCustomerModal(true); }}>
                  ⚙️
                </button>
                <div className="hexagon-icon">
                  <img src={getLogo(customer)} alt={customer.name} />
                </div>
                <div className="customer-name">{customer.name}</div>
                <div className="customer-meta">{customer.type} • {customer.sites.length} Sites</div>
                <button className="view-sites-btn">Manage Sites</button>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Full Screen Panel */}
      {showPanel && activeCustomer && (
        <div className="full-screen-panel active">
          <div className="panel-header">
            <h2>{activeCustomer.name}</h2>
            <button className="btn btn-outline" onClick={() => setShowPanel(false)}>← Back to Hive</button>
          </div>
          <div className="panel-toolbar">
            <span>{activeCustomer.sites.length} locations</span>
            <button className="btn btn-primary" onClick={() => setShowSiteModal(true)}>
              ➕ Add New Site
            </button>
          </div>
          <div className="panel-content">
            <div className="sites-grid">
              {activeCustomer.sites.map((site, idx) => (
                <div key={idx} className="site-card">
                  <div className="site-actions">
                    <button title="Edit">✏️</button>
                    <button title="Delete">🗑️</button>
                  </div>
                  <div className="site-name">{site.name}</div>
                  <div className="site-address">📍 {site.address}</div>
                  <span className={`status-badge ${site.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                    {site.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPortal;
