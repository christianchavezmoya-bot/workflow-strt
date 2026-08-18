import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { LatLng } from "leaflet";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Alert,
  Menu,
  MenuItem,
  Autocomplete
} from "@mui/material";
import { EditOutlined, DeleteOutline, MapOutlined, TableViewOutlined, SearchOutlined, AddLocationAltOutlined } from "@mui/icons-material";
import "leaflet/dist/leaflet.css";
import { geocodingService } from "../services/geocodingService";
import { countries } from "../data/countries";
import { getStatesForCountry } from "../data/states";
import { usePermissions } from "../hooks/usePermissions";

// Fix default marker icon in Leaflet
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Style for field labels (yellow bold)
const fieldLabelStyle = {
  color: '#FFD700',
  fontWeight: 'bold'
};

export interface Office {
  id: string;
  country: string;
  state: string;
  city: string;
  lat: number;
  lng: number;
}

interface GlobalOfficeMapProps {
  offices: Office[];
  onAddOffice: (office: Omit<Office, "id">) => void;
  onUpdateOffice: (id: string, office: Omit<Office, "id">) => void;
  onDeleteOffice: (id: string) => void;
}

export default function GlobalOfficeMap({
  offices,
  onAddOffice,
  onUpdateOffice,
  onDeleteOffice
}: GlobalOfficeMapProps) {
  const can = usePermissions();
  const [view, setView] = useState<"map" | "table">("map");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [formData, setFormData] = useState({
    country: "",
    state: "",
    city: "",
    lat: 0,
    lng: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    office: Office;
  } | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<Array<{
    city: string;
    state: string;
    country: string;
    displayName: string;
    lat: number;
    lng: number;
  }>>([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [availableStates, setAvailableStates] = useState<string[]>([]);

  const handleAddNewOffice = () => {
    setEditingOffice(null);
    setFormData({
      country: "",
      state: "",
      city: "",
      lat: 0,
      lng: 0
    });
    setDialogOpen(true);
    setError(null);
    setCitySuggestions([]);
  };

  // Search for cities using Nominatim API
  const searchCities = async (searchText: string, country?: string, state?: string) => {
    if (!searchText || searchText.length < 2) {
      setCitySuggestions([]);
      return;
    }

    setCitySearchLoading(true);
    try {
      const parts = [searchText, state, country].filter(Boolean);
      const query = parts.join(", ");

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=20&addressdetails=1`,
        {
          headers: {
            "User-Agent": "Commtrac-Project-Studio"
          }
        }
      );

      if (response.ok) {
        const results = await response.json();
        let suggestions = results.map((result: any) => {
          const address = result.address;
          const city = address.city || address.town || address.village || address.municipality || "";
          const resultState = address.state || address.province || address.region || "";
          const resultCountry = address.country || "";
          return {
            city,
            state: resultState,
            country: resultCountry,
            displayName: result.display_name,
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon)
          };
        }).filter((item: any) => item.city);

        // Filter by selected state if specified
        if (state && state.trim()) {
          suggestions = suggestions.filter((item: any) =>
            item.state.toLowerCase().includes(state.toLowerCase()) ||
            state.toLowerCase().includes(item.state.toLowerCase())
          );
        }

        // Filter by selected country if specified
        if (country && country.trim()) {
          suggestions = suggestions.filter((item: any) =>
            item.country.toLowerCase().includes(country.toLowerCase()) ||
            country.toLowerCase().includes(item.country.toLowerCase())
          );
        }

        // Limit to 10 results
        setCitySuggestions(suggestions.slice(0, 10));
      }
    } catch (error) {
      console.error("City search error:", error);
    } finally {
      setCitySearchLoading(false);
    }
  };

  // Update available states when country changes
  useEffect(() => {
    if (formData.country) {
      const states = getStatesForCountry(formData.country);
      setAvailableStates(states);
    } else {
      setAvailableStates([]);
    }
  }, [formData.country]);

  // Debounce city search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.city && formData.city.length >= 2) {
        searchCities(formData.city, formData.country, formData.state);
      } else {
        setCitySuggestions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.city, formData.country, formData.state]);

  const handleMarkerRightClick = (event: any, office: Office) => {
    event.originalEvent.preventDefault();
    setContextMenu({
      mouseX: event.originalEvent.clientX,
      mouseY: event.originalEvent.clientY,
      office
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextMenuEdit = () => {
    if (contextMenu) {
      handleEditOffice(contextMenu.office);
      handleCloseContextMenu();
    }
  };

  const handleContextMenuDelete = () => {
    if (contextMenu) {
      onDeleteOffice(contextMenu.office.id);
      handleCloseContextMenu();
    }
  };

  const handleEditOffice = (office: Office) => {
    setEditingOffice(office);
    setFormData({
      country: office.country,
      state: office.state,
      city: office.city,
      lat: office.lat,
      lng: office.lng
    });
    // Set available states for the office's country
    const states = getStatesForCountry(office.country);
    setAvailableStates(states);
    setDialogOpen(true);
    setError(null);
    setCitySuggestions([]);
  };

  const handleFindLocation = async () => {
    if (!formData.city.trim() || !formData.country.trim()) {
      setError("City and Country are required to find location");
      return;
    }

    setIsGeocoding(true);
    setError(null);

    const result = await geocodingService.geocode(
      formData.city,
      formData.state,
      formData.country
    );

    if (result) {
      setFormData((prev) => ({
        ...prev,
        lat: result.lat,
        lng: result.lng
      }));
    } else {
      setError("Could not find location. Please check the address.");
    }

    setIsGeocoding(false);
  };

  const handleSaveOffice = async () => {
    // Validate
    if (!formData.country.trim() || !formData.city.trim()) {
      setError("Country and City are required");
      return;
    }

    // Auto-geocode if coordinates are not set
    const finalData = { ...formData };
    if (formData.lat === 0 && formData.lng === 0) {
      setIsGeocoding(true);
      const result = await geocodingService.geocode(
        formData.city,
        formData.state,
        formData.country
      );

      if (result) {
        finalData.lat = result.lat;
        finalData.lng = result.lng;
      } else {
        setError("Could not find location. Please check the address or click on the map.");
        setIsGeocoding(false);
        return;
      }
      setIsGeocoding(false);
    }

    if (editingOffice) {
      onUpdateOffice(editingOffice.id, {
        country: finalData.country,
        state: finalData.state,
        city: finalData.city,
        lat: finalData.lat,
        lng: finalData.lng
      });
    } else {
      onAddOffice({
        country: finalData.country,
        state: finalData.state,
        city: finalData.city,
        lat: finalData.lat,
        lng: finalData.lng
      });
    }

    setDialogOpen(false);
    setFormData({ country: "", state: "", city: "", lat: 0, lng: 0 });
    setError(null);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingOffice(null);
    setFormData({ country: "", state: "", city: "", lat: 0, lng: 0 });
    setError(null);
  };

  return (
    <Box>
      {/* Header with View Toggle and Add Button */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">Global Offices</Typography>
          {can.modifyData && (
            <Button
              variant="contained"
              startIcon={<AddLocationAltOutlined />}
              onClick={handleAddNewOffice}
              size="small"
            >
              Add Office
            </Button>
          )}
        </Stack>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, newView) => newView && setView(newView)}
          size="small"
        >
          <ToggleButton value="map">
            <MapOutlined sx={{ mr: 0.5 }} fontSize="small" />
            Map
          </ToggleButton>
          <ToggleButton value="table">
            <TableViewOutlined sx={{ mr: 0.5 }} fontSize="small" />
            Table
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Map View */}
      {view === "map" && (
        <Box sx={{ height: 600, border: "1px solid #ddd", borderRadius: 1, overflow: "hidden", position: "relative" }}>
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            maxZoom={5}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {offices.map((office) => (
              <Marker
                key={office.id}
                position={[office.lat, office.lng]}
                eventHandlers={{
                  contextmenu: (e) => handleMarkerRightClick(e, office)
                }}
              />
            ))}
          </MapContainer>

          <Box sx={{ p: 2, bgcolor: "info.light", borderTop: "1px solid #ddd" }}>
            <Typography variant="body2" color="info.contrastText">
              💡 Right-click on office markers to view details
            </Typography>
          </Box>
        </Box>
      )}

      {/* Table View */}
      {view === "table" && (
        <Box>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell sx={fieldLabelStyle}>Country</TableCell>
                <TableCell sx={fieldLabelStyle}>State/Region</TableCell>
                <TableCell sx={fieldLabelStyle}>City</TableCell>
                {can.modifyData && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {offices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No offices yet. Switch to map view and click to add offices.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                offices.map((office, index) => (
                  <TableRow key={office.id} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{office.country}</TableCell>
                    <TableCell>{office.state || "-"}</TableCell>
                    <TableCell>{office.city}</TableCell>
                    {can.modifyData && (
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Edit office">
                            <IconButton size="small" onClick={() => handleEditOffice(office)}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete office">
                            <IconButton size="small" onClick={() => onDeleteOffice(office.id)}>
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Add/Edit Office Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingOffice ? "Edit Office" : "Add New Office"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {isGeocoding && (
              <Alert severity="info">
                🔍 Finding location...
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}

            <Typography variant="body2" color="text.secondary">
              Enter the address below. Coordinates will be found automatically.
            </Typography>

            <Autocomplete
              value={formData.country}
              onChange={(_, newValue) => {
                setFormData((prev) => ({
                  ...prev,
                  country: newValue || "",
                  state: "" // Reset state when country changes
                }));
              }}
              inputValue={formData.country}
              onInputChange={(_, newInputValue) => {
                setFormData((prev) => ({ ...prev, country: newInputValue }));
              }}
              options={countries}
              freeSolo
              disabled={isGeocoding}
              renderInput={(params) => (
                <TextField {...params} label="Country *" fullWidth InputLabelProps={{ sx: fieldLabelStyle }} />
              )}
            />

            <Autocomplete<{ city: string; state: string; country: string; displayName: string; lat: number; lng: number }, false, false, true>
              value={null}
              onChange={(_, newValue) => {
                if (newValue && typeof newValue === 'object') {
                  // Auto-populate country, state, and coordinates when selecting a city from suggestions
                  setFormData((prev) => ({
                    ...prev,
                    city: newValue.city,
                    state: newValue.state || prev.state,
                    country: newValue.country || prev.country,
                    lat: newValue.lat,
                    lng: newValue.lng
                  }));
                  setCitySuggestions([]);
                }
              }}
              inputValue={formData.city}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'input') {
                  setFormData((prev) => ({ ...prev, city: newInputValue }));
                }
              }}
              options={citySuggestions}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.city}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props as any;
                return (
                  <li key={key} {...otherProps}>
                    <Box>
                      <Typography variant="body2"><strong>{(option as { city: string }).city}</strong></Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[(option as any).state, (option as any).country].filter(Boolean).join(", ")}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              loading={citySearchLoading}
              loadingText="Searching for cities..."
              freeSolo
              disabled={isGeocoding}
              openOnFocus={false}
              filterOptions={(x) => x}
              noOptionsText={formData.city.length < 2 ? "Type at least 2 characters to search" : citySearchLoading ? "Searching..." : "No cities found"}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="City *"
                  fullWidth
                  InputLabelProps={{ shrink: true, sx: fieldLabelStyle }}
                  placeholder="Start typing city name..."
                  helperText={citySuggestions.length > 0 ? `${citySuggestions.length} cities found - select one to auto-populate` : "Type at least 2 characters to search cities"}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {citySearchLoading ? <Typography variant="caption" sx={{ mr: 1 }}>Searching...</Typography> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            {/* State/Region sits after City: picking a city auto-fills it. */}
            <Autocomplete
              value={formData.state}
              onChange={(_, newValue) => {
                setFormData((prev) => ({ ...prev, state: newValue || "" }));
              }}
              inputValue={formData.state}
              onInputChange={(_, newInputValue) => {
                setFormData((prev) => ({ ...prev, state: newInputValue }));
              }}
              options={availableStates}
              freeSolo
              disabled={isGeocoding || !formData.country}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="State/Region"
                  fullWidth
                  InputLabelProps={{ sx: fieldLabelStyle }}
                  helperText={availableStates.length > 0 ? `${availableStates.length} states available` : "Type to enter state manually"}
                />
              )}
            />

            <Button
              variant="outlined"
              startIcon={<SearchOutlined />}
              onClick={handleFindLocation}
              disabled={isGeocoding || !formData.city || !formData.country}
              fullWidth
            >
              Find Location on Map
            </Button>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                type="number"
                value={formData.lat}
                onChange={(e) => setFormData((prev) => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                fullWidth
                disabled={isGeocoding}
                helperText="Auto-detected"
              />
              <TextField
                label="Longitude"
                type="number"
                value={formData.lng}
                onChange={(e) => setFormData((prev) => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
                fullWidth
                disabled={isGeocoding}
                helperText="Auto-detected"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isGeocoding}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveOffice} disabled={isGeocoding}>
            {isGeocoding ? "Finding Location..." : editingOffice ? "Update Office" : "Add Office"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Right-Click Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {contextMenu && (
          <Box sx={{ p: 2, minWidth: 200 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {contextMenu.office.city}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {contextMenu.office.state && `${contextMenu.office.state}, `}
              {contextMenu.office.country}
            </Typography>
            {can.modifyData && (
              <Stack spacing={1}>
                <MenuItem onClick={handleContextMenuEdit}>
                  <EditOutlined sx={{ mr: 1 }} fontSize="small" />
                  Edit Office
                </MenuItem>
                <MenuItem onClick={handleContextMenuDelete} sx={{ color: "error.main" }}>
                  <DeleteOutline sx={{ mr: 1 }} fontSize="small" />
                  Delete Office
                </MenuItem>
              </Stack>
            )}
          </Box>
        )}
      </Menu>
    </Box>
  );
}
