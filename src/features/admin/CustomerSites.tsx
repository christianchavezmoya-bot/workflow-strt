import {
  Box,
  Button,
  Container,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowBack, DeleteOutline, EditOutlined, AddOutlined } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Site } from "../../types/site";
import api from "../../services/api";
import DeleteConfirmDialog from "../../components/ui/DeleteConfirmDialog";
import { useAppToast } from "../../contexts/AppToastContext";
import { usePermissions } from "../../hooks/usePermissions";

const CustomerSites = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const can = usePermissions();
  const toast = useAppToast();

  const [customerName, setCustomerName] = useState<string>("Loading...");
  const [customerLogo, setCustomerLogo] = useState<string | null>(null);
  const [customerLogoShape, setCustomerLogoShape] = useState<'none' | 'round' | 'rectangular'>('round');
  const [customerLogoSize, setCustomerLogoSize] = useState<number>(70);
  const [customerPhotoScale, setCustomerPhotoScale] = useState<number>(100);
  const [sitesList, setSitesList] = useState<Site[]>([]);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);

  // Edit form state
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteAddress, setEditSiteAddress] = useState("");
  const [editSiteCity, setEditSiteCity] = useState("");
  const [editSiteState, setEditSiteState] = useState("");
  const [editSiteCountry, setEditSiteCountry] = useState("");
  const [editSiteContactName, setEditSiteContactName] = useState("");
  const [editSiteContactPhone, setEditSiteContactPhone] = useState("");

  // Fetch customer info
  useEffect(() => {
    if (!customerId) return;

    const fetchCustomer = async () => {
      try {
        const response = await api.get(`/customers`);
        const customer = response.data.find((c: any) => c.id === customerId);
        if (customer) {
          setCustomerName(customer.name);
          setCustomerLogo(customer.logo || null);
          setCustomerLogoShape(customer.logoShape || 'round');
          setCustomerLogoSize(customer.logoSize || 70);
          setCustomerPhotoScale(customer.photoScale || 100);
        }
      } catch (err) {
        console.error("Failed to fetch customer", err);
      }
    };

    fetchCustomer();
  }, [customerId]);

  // Fetch sites for this customer
  useEffect(() => {
    if (!customerId) return;

    const fetchSites = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/sites?customerId=${customerId}`);
        setSitesList(response.data);
      } catch (err) {
        setError("Failed to load sites");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, [customerId]);

  const handleAddNewSite = () => {
    const newSite: Site = {
      id: `new-${Date.now()}`,
      customerId: customerId!,
      name: "",
      address: "",
      city: "",
      state: "",
      country: "",
      contactName: "",
      contactPhone: "",
      createdAt: new Date().toISOString(),
    };

    setSitesList((prev) => [newSite, ...prev]);
    setEditingSiteId(newSite.id);
    setEditSiteName("");
    setEditSiteAddress("");
    setEditSiteCity("");
    setEditSiteState("");
    setEditSiteCountry("");
    setEditSiteContactName("");
    setEditSiteContactPhone("");
  };

  const handleSaveSite = async (siteId: string) => {
    const isNewSite = siteId.startsWith("new-");

    try {
      if (isNewSite) {
        // Create new site
        const response = await api.post("/sites", {
          customerId: String(customerId),
          name: editSiteName,
          address: editSiteAddress,
          city: editSiteCity,
          state: editSiteState,
          country: editSiteCountry,
          zipCode: null,
          contactName: editSiteContactName,
          contactPhone: editSiteContactPhone,
          contactEmail: null,
          notes: null,
        });

        // Replace temporary site with saved site
        setSitesList((prev) =>
          prev.map((s) => (s.id === siteId ? response.data : s))
        );
      } else {
        // Update existing site
        const response = await api.put(`/sites/${siteId}`, {
          customerId: String(customerId),
          name: editSiteName,
          address: editSiteAddress,
          city: editSiteCity,
          state: editSiteState,
          country: editSiteCountry,
          zipCode: null,
          contactName: editSiteContactName,
          contactPhone: editSiteContactPhone,
          contactEmail: null,
          notes: null,
        });

        setSitesList((prev) =>
          prev.map((s) => (s.id === siteId ? response.data : s))
        );
      }

      setEditingSiteId(null);
      resetEditForm();
    } catch (err: any) {
      console.error("Failed to save site", err);
      const errorMessage = err?.response?.data || err?.message || "Failed to save site";
      toast.error(`Failed to save site: ${errorMessage}`);
    }
  };

  const handleDeleteSite = (siteId: string) => {
    const target = sitesList.find((site) => site.id === siteId);
    if (!target) return;
    setDeleteTarget(target);
  };

  const confirmDeleteSite = async () => {
    if (!deleteTarget) return;
    const isNewSite = deleteTarget.id.startsWith("new-");

    if (isNewSite) {
      // Just remove from local state
      setSitesList((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      return;
    }

    try {
      setDeleteSavingId(deleteTarget.id);
      await api.delete(`/sites/${deleteTarget.id}`);
      setSitesList((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete site", err);
      toast.error("Failed to delete site");
    } finally {
      setDeleteSavingId(null);
    }
  };

  const handleEditClick = (site: Site) => {
    setEditingSiteId(site.id);
    setEditSiteName(site.name);
    setEditSiteAddress(site.address || "");
    setEditSiteCity(site.city || "");
    setEditSiteState(site.state || "");
    setEditSiteCountry(site.country || "");
    setEditSiteContactName(site.contactName || "");
    setEditSiteContactPhone(site.contactPhone || "");
  };

  const resetEditForm = () => {
    setEditSiteName("");
    setEditSiteAddress("");
    setEditSiteCity("");
    setEditSiteState("");
    setEditSiteCountry("");
    setEditSiteContactName("");
    setEditSiteContactPhone("");
  };

  const getInitial = (name: string) => {
    return name.trim().charAt(0).toUpperCase() || "S";
  };

  return (
    <Container maxWidth="xl">
      <Stack spacing={3} sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton onClick={() => navigate("/admin", { state: { openTab: "customers" } })}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontFamily: "Sora", fontWeight: 600 }}>
              Sites - {customerName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage physical locations for this customer
            </Typography>
          </Box>
          {can.modifyData && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={handleAddNewSite}
            >
              Add New Site
            </Button>
          )}
        </Box>

        {/* Loading State */}
        {loading && (
          <Typography variant="body2" color="text.secondary">
            Loading sites...
          </Typography>
        )}

        {/* Sites Grid or Empty State */}
        {!loading && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: 2,
            }}
          >
            {/* Empty State Card */}
            {sitesList.length === 0 && (
              <Box
                sx={{
                  perspective: "1000px",
                  height: "220px",
                }}
              >
                <Paper
                  sx={{
                    width: "100%",
                    height: "100%",
                    p: 2,
                    textAlign: "center",
                    border: "1px solid",
                    borderColor: "divider",
                    borderBottom: "4px solid",
                    borderBottomColor: "primary.main",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  {customerLogoShape === 'none' && customerLogo ? (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        maxWidth: '100%',
                        maxHeight: '70px',
                      }}
                    >
                      <img
                        src={customerLogo}
                        alt={customerName}
                        style={{
                          maxWidth: '100%',
                          maxHeight: `${70 * (customerPhotoScale / 100)}px`,
                          height: 'auto',
                          width: 'auto',
                          objectFit: 'contain',
                        }}
                      />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        width: customerLogoShape === 'rectangular' ? 140 : customerLogoSize,
                        height: customerLogoSize,
                        borderRadius: customerLogoShape === 'none' ? '0px' : customerLogoShape === 'round' ? '50%' : '8px',
                        background: customerLogo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        backgroundImage: customerLogo ? `url(${customerLogo})` : 'none',
                        backgroundSize: `${customerPhotoScale}%`,
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '1.5rem',
                      }}
                    >
                      {!customerLogo && 'S'}
                    </Box>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    No sites found
                  </Typography>
                  {can.modifyData && (
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<AddOutlined />}
                      onClick={handleAddNewSite}
                    >
                      Add New Site
                    </Button>
                  )}
                </Paper>
              </Box>
            )}

            {/* Site Cards */}
            {sitesList.map((site) => {
              const isFlipped = editingSiteId === site.id;
              return (
                <Box
                  key={site.id}
                  sx={{
                    perspective: "1000px",
                    height: "220px",
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      transition: "transform 0.6s",
                      transformStyle: "preserve-3d",
                      transform: isFlipped ? "rotateX(180deg)" : "rotateX(0deg)",
                    }}
                  >
                    {/* Front Face */}
                    <Paper
                      sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        p: 2,
                        textAlign: "center",
                        border: "1px solid",
                        borderColor: "divider",
                        borderBottom: "4px solid",
                        borderBottomColor: "primary.main",
                        cursor: "pointer",
                        transition: "boxShadow 0.2s",
                        "&:hover": {
                          boxShadow: 3,
                        },
                      }}
                    >
                      {can.modifyData && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.25,
                          }}
                        >
                          <Tooltip title="Delete site">
                            <IconButton
                              size="small"
                              sx={{ padding: 0.25 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSite(site.id);
                              }}
                            >
                              <DeleteOutline sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit site">
                            <IconButton
                              size="small"
                              sx={{ padding: 0.25 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(site);
                              }}
                            >
                              <EditOutlined sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}

                      {/* Customer Logo */}
                      {customerLogoShape === 'none' && customerLogo ? (
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            margin: '0 auto 12px',
                            maxWidth: '100%',
                            maxHeight: '70px',
                          }}
                        >
                          <img
                            src={customerLogo}
                            alt={customerName}
                            style={{
                              maxWidth: '100%',
                              maxHeight: `${70 * (customerPhotoScale / 100)}px`,
                              height: 'auto',
                              width: 'auto',
                              objectFit: 'contain',
                            }}
                          />
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            width: customerLogoShape === 'rectangular' ? 140 : customerLogoSize,
                            height: customerLogoSize,
                            borderRadius: customerLogoShape === 'none' ? '0px' : customerLogoShape === 'round' ? '50%' : '8px',
                            background: customerLogo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            backgroundImage: customerLogo ? `url(${customerLogo})` : 'none',
                            backgroundSize: `${customerPhotoScale}%`,
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 12px',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1.5rem',
                          }}
                        >
                          {!customerLogo && getInitial(site.name)}
                        </Box>
                      )}

                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {site.name || "Unnamed Site"}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        sx={{ display: "block", mb: 1 }}
                      >
                        {[site.city, site.state, site.country].filter(Boolean).join(", ") || "No location"}
                      </Typography>
                      {site.contactName && (
                        <Typography variant="caption" color="textSecondary" sx={{ display: "block" }}>
                          Contact: {site.contactName}
                        </Typography>
                      )}
                    </Paper>

                    {/* Back Face (Edit Mode) */}
                    <Paper
                      sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        transform: "rotateX(180deg)",
                        p: 2,
                        textAlign: "center",
                        border: "1px solid",
                        borderColor: "divider",
                        borderBottom: "4px solid",
                        borderBottomColor: "secondary.main",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: 1,
                      }}
                    >
                      {/* Customer Logo */}
                      {customerLogoShape === 'none' && customerLogo ? (
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            margin: '0 auto 8px',
                            maxWidth: '100%',
                            maxHeight: '60px',
                          }}
                        >
                          <img
                            src={customerLogo}
                            alt={customerName}
                            style={{
                              maxWidth: '100%',
                              maxHeight: `${60 * (customerPhotoScale / 100)}px`,
                              height: 'auto',
                              width: 'auto',
                              objectFit: 'contain',
                            }}
                          />
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            width: customerLogoShape === 'rectangular' ? 120 : (customerLogoSize - 10),
                            height: customerLogoSize - 10,
                            borderRadius: customerLogoShape === 'none' ? '0px' : customerLogoShape === 'round' ? '50%' : '8px',
                            background: customerLogo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            backgroundImage: customerLogo ? `url(${customerLogo})` : 'none',
                            backgroundSize: `${customerPhotoScale}%`,
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1.3rem',
                          }}
                        >
                          {!customerLogo && getInitial(editSiteName)}
                        </Box>
                      )}

                      <TextField
                        size="small"
                        value={editSiteName}
                        onChange={(e) => setEditSiteName(e.target.value)}
                        placeholder="Site Name"
                        fullWidth
                        sx={{
                          "& .MuiInputBase-root": {
                            height: 32,
                            fontSize: "1rem",
                            fontWeight: 600,
                          },
                        }}
                      />
                      <Stack direction="row" spacing={0.5}>
                        <TextField
                          size="small"
                          value={editSiteCity}
                          onChange={(e) => setEditSiteCity(e.target.value)}
                          placeholder="City"
                          fullWidth
                          sx={{
                            "& .MuiInputBase-root": {
                              height: 26,
                              fontSize: "0.75rem",
                            },
                          }}
                        />
                        <TextField
                          size="small"
                          value={editSiteState}
                          onChange={(e) => setEditSiteState(e.target.value)}
                          placeholder="State"
                          fullWidth
                          sx={{
                            "& .MuiInputBase-root": {
                              height: 26,
                              fontSize: "0.75rem",
                            },
                          }}
                        />
                        <TextField
                          size="small"
                          value={editSiteCountry}
                          onChange={(e) => setEditSiteCountry(e.target.value)}
                          placeholder="Country"
                          fullWidth
                          sx={{
                            "& .MuiInputBase-root": {
                              height: 26,
                              fontSize: "0.75rem",
                            },
                          }}
                        />
                      </Stack>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSaveSite(site.id)}
                      >
                        Save
                      </Button>
                    </Paper>
                  </Box>
                </Box>
              );
            })}
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
          onConfirm={confirmDeleteSite}
        />
      </Stack>
    </Container>
  );
};

export default CustomerSites;
