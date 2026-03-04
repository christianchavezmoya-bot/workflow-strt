import { useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CloseOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  StarOutlined,
} from "@mui/icons-material";
import { NavLink } from "react-router-dom";
import { useFavoritesContext } from "../../contexts/FavoritesContext";

const FavoritesSection = () => {
  const { favorites, remove } = useFavoritesContext();
  const [expanded, setExpanded] = useState(true);

  if (favorites.length === 0) return null;

  return (
    <Box>
      {/* Section header */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          px: 1,
          py: 0.5,
          cursor: "pointer",
          userSelect: "none",
          borderRadius: 1,
          "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <StarOutlined sx={{ fontSize: "0.85rem", color: "#f59e0b", mr: 0.75, flexShrink: 0 }} />
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "text.secondary",
            fontSize: "0.68rem",
          }}
        >
          Favorites
        </Typography>
        <IconButton size="small" sx={{ p: 0.25, color: "text.disabled" }}>
          {expanded ? (
            <ExpandLessOutlined sx={{ fontSize: "0.9rem" }} />
          ) : (
            <ExpandMoreOutlined sx={{ fontSize: "0.9rem" }} />
          )}
        </IconButton>
      </Stack>

      {/* Favorite items */}
      <Collapse in={expanded} timeout="auto">
        <Box sx={{ pb: 0.5 }}>
          {favorites.map((fav) => (
            <Box
              key={fav.id}
              sx={{
                position: "relative",
                "&:hover .fav-remove": { opacity: 1 },
              }}
            >
              <ListItemButton
                component={NavLink}
                to={fav.path}
                sx={{
                  borderRadius: 1.5,
                  py: 0.5,
                  pl: 1.5,
                  pr: 4,
                  color: "text.primary",
                  minHeight: 36,
                  "&.active": {
                    background: "rgba(45, 212, 191, 0.18)",
                    color: "#eafaf7",
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 28, color: "#f59e0b" }}>
                  <StarOutlined sx={{ fontSize: "0.85rem" }} />
                </ListItemIcon>
                <ListItemText
                  primary={fav.label}
                  primaryTypographyProps={{
                    variant: "body2",
                    noWrap: true,
                    sx: { fontSize: "0.8rem" },
                  }}
                />
              </ListItemButton>

              {/* Remove button — visible on row hover */}
              <Tooltip title="Remove from Favorites">
                <IconButton
                  className="fav-remove"
                  size="small"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(fav.id);
                  }}
                  sx={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0,
                    transition: "opacity 0.15s",
                    p: 0.25,
                    color: "text.disabled",
                    "&:hover": { color: "error.main" },
                  }}
                >
                  <CloseOutlined sx={{ fontSize: "0.8rem" }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

export default FavoritesSection;
