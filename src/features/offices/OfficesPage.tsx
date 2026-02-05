import { useState, useEffect } from "react";
import { Box, CircularProgress, Alert } from "@mui/material";
import GlobalOfficeMap, { Office } from "../../components/GlobalOfficeMap";
import { officesService } from "../../services/officesService";

const OfficesPage = () => {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOffices();
  }, []);

  const loadOffices = async () => {
    try {
      setLoading(true);
      const data = await officesService.getAll();
      setOffices(data);
      setError(null);
    } catch (err) {
      setError("Failed to load offices");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOffice = async (office: Omit<Office, "id">) => {
    try {
      const newOffice = await officesService.create(office);
      setOffices((prev) => [...prev, newOffice]);
    } catch (err) {
      console.error("Failed to add office:", err);
      throw err;
    }
  };

  const handleUpdateOffice = async (id: string, office: Omit<Office, "id">) => {
    try {
      const updatedOffice = await officesService.update(id, office);
      setOffices((prev) => prev.map((o) => (o.id === id ? updatedOffice : o)));
    } catch (err) {
      console.error("Failed to update office:", err);
      throw err;
    }
  };

  const handleDeleteOffice = async (id: string) => {
    try {
      await officesService.delete(id);
      setOffices((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error("Failed to delete office:", err);
      throw err;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <GlobalOfficeMap
      offices={offices}
      onAddOffice={handleAddOffice}
      onUpdateOffice={handleUpdateOffice}
      onDeleteOffice={handleDeleteOffice}
    />
  );
};

export default OfficesPage;
