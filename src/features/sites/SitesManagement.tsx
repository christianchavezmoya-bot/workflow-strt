import {
  Box,
  Button,
  Container,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  DeleteOutline,
  EditOutlined,
  GridView,
  TableRows,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import api from "../../services/api";
import DeleteConfirmDialog from "../../components/ui/DeleteConfirmDialog";

interface Site {
  id: string;
  customerId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  logo?: string | null;
  logoShape?: 'none' | 'round' | 'rectangular';
  logoSize?: number;
  photoScale?: number;
}

export const SitesManagement = () => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [sites, setSites] = useState<Site[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Site>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sitesResponse, customersResponse] = await Promise.all([
        api.get('/sites'),
        api.get('/customers'),
      ]);
      setSites(sitesResponse.data);
      setCustomers(customersResponse.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Unknown Customer';
  };

  const getCustomerLogo = (customerId: string) => {
    return customers.find(c => c.id === customerId);
  };

  const handleEdit = (site: Site) => {
    setEditingSiteId(site.id);
    setEditFormData(site);
  };

  const handleSave = async () => {
    if (!editingSiteId) return;

    try {
      const response = await api.put(`/sites/${editingSiteId}`, {
        name: editFormData.name,
        address: editFormData.address,
        city: editFormData.city,
        state: editFormData.state,
        country: editFormData.country,
        zipCode: null,
        contactName: editFormData.contactName,
        contactPhone: editFormData.contactPhone,
        contactEmail: null,
        notes: editFormData.notes,
      });

      setSites(prev => prev.map(s => s.id === editingSiteId ? response.data : s));
      setEditingSiteId(null);
      setEditFormData({});
    } catch (err) {
      console.error('Failed to save site', err);
      alert('Failed to save site');
    }
  };

  const handleDelete = async (siteId: string) => {
    const target = sites.find((site) => site.id === siteId);
    if (!target) return;
    setDeleteTarget(target);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteSavingId(deleteTarget.id);
      await api.delete(`/sites/${deleteTarget.id}`);
      setSites(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete site', err);
      alert('Failed to delete site');
    } finally {
      setDeleteSavingId(null);
    }
  };

  const handleCancel = () => {
    setEditingSiteId(null);
    setEditFormData({});
  };

  return (
    <Container maxWidth="xl">
      <Stack spacing={3} sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h5" sx={{ fontFamily: 'Sora', fontWeight: 600 }}>
              Sites Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View and manage all customer sites
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, value) => value && setViewMode(value)}
            size="small"
          >
            <ToggleButton value="table">
              <TableRows sx={{ mr: 1 }} />
              Table
            </ToggleButton>
            <ToggleButton value="cards">
              <GridView sx={{ mr: 1 }} />
              Cards
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Table View */}
        {viewMode === 'table' && (
          <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell width="60">#</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Site Name</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Comments</TableCell>
                  <TableCell width="120" align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">Loading...</TableCell>
                  </TableRow>
                ) : sites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">No sites found</TableCell>
                  </TableRow>
                ) : (
                  sites.map((site, index) => {
                    const isEditing = editingSiteId === site.id;
                    const customer = getCustomerLogo(site.customerId);

                    return (
                      <TableRow key={site.id} hover={!isEditing}>
                        <TableCell>{index + 1}</TableCell>

                        {/* Customer */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {customer?.logo ? (
                              customer.logoShape === 'none' ? (
                                <img
                                  src={customer.logo}
                                  alt={customer.name}
                                  style={{
                                    maxHeight: '30px',
                                    maxWidth: '60px',
                                    objectFit: 'contain',
                                  }}
                                />
                              ) : (
                                <Box
                                  sx={{
                                    width: customer.logoShape === 'rectangular' ? 60 : 30,
                                    height: 30,
                                    borderRadius: customer.logoShape === 'round' ? '50%' : '4px',
                                    backgroundImage: `url(${customer.logo})`,
                                    backgroundSize: `${customer.photoScale || 100}%`,
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                  }}
                                />
                              )
                            ) : (
                              <Box
                                sx={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                }}
                              >
                                {getCustomerName(site.customerId).charAt(0)}
                              </Box>
                            )}
                            <Typography variant="body2">
                              {getCustomerName(site.customerId)}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Site Name */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editFormData.name || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                              fullWidth
                            />
                          ) : (
                            site.name
                          )}
                        </TableCell>

                        {/* City */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editFormData.city || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, city: e.target.value }))}
                              fullWidth
                            />
                          ) : (
                            site.city || '-'
                          )}
                        </TableCell>

                        {/* State */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editFormData.state || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, state: e.target.value }))}
                              fullWidth
                            />
                          ) : (
                            site.state || '-'
                          )}
                        </TableCell>

                        {/* Country */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editFormData.country || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, country: e.target.value }))}
                              fullWidth
                            />
                          ) : (
                            site.country || '-'
                          )}
                        </TableCell>

                        {/* Comments */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editFormData.notes || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                              fullWidth
                              multiline
                              rows={2}
                            />
                          ) : (
                            site.notes || '-'
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell align="center">
                          {isEditing ? (
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Button size="small" variant="contained" onClick={handleSave}>
                                Save
                              </Button>
                              <Button size="small" variant="outlined" onClick={handleCancel}>
                                Cancel
                              </Button>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => handleEdit(site)}>
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" onClick={() => handleDelete(site.id)} color="error">
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Card View */}
        {viewMode === 'cards' && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 2,
            }}
          >
            {loading ? (
              <Typography>Loading...</Typography>
            ) : sites.length === 0 ? (
              <Typography>No sites found</Typography>
            ) : (
              sites.map((site) => {
                const customer = getCustomerLogo(site.customerId);

                return (
                  <Paper
                    key={site.id}
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderBottom: '4px solid',
                      borderBottomColor: 'primary.main',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        boxShadow: 6,
                        transform: 'translateY(-4px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {customer?.logo ? (
                          customer.logoShape === 'none' ? (
                            <img
                              src={customer.logo}
                              alt={customer.name}
                              style={{
                                maxHeight: '40px',
                                maxWidth: '80px',
                                objectFit: 'contain',
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: customer.logoShape === 'rectangular' ? 80 : 40,
                                height: 40,
                                borderRadius: customer.logoShape === 'round' ? '50%' : '4px',
                                backgroundImage: `url(${customer.logo})`,
                                backgroundSize: `${customer.photoScale || 100}%`,
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                              }}
                            />
                          )
                        ) : (
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '1rem',
                              fontWeight: 'bold',
                            }}
                          >
                            {getCustomerName(site.customerId).charAt(0)}
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEdit(site)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDelete(site.id)} color="error">
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      {getCustomerName(site.customerId)}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {site.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {site.city && site.state ? `${site.city}, ${site.state}` : site.city || site.state || 'No location'}
                    </Typography>
                    {site.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
                        {site.notes}
                      </Typography>
                    )}
                  </Paper>
                );
              })
            )}
          </Box>
        )}
        <DeleteConfirmDialog
          open={!!deleteTarget}
          entityType="site"
          entityLabel={deleteTarget?.name || deleteTarget?.id}
          loading={!!deleteTarget && deleteSavingId === deleteTarget.id}
          onClose={() => {
            if (deleteSavingId) return;
            setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      </Stack>
    </Container>
  );
};

export default SitesManagement;
