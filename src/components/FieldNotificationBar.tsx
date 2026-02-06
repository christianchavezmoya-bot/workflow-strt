import { Alert, Box, Collapse, IconButton, Stack, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useFieldNotifications } from '../contexts/FieldNotificationContext';

export const FieldNotificationBar = () => {
  const { notifications, dismissNotification, clearAll } = useFieldNotifications();

  if (notifications.length === 0) return null;

  const latestNotification = notifications[0];
  const otherCount = notifications.length - 1;

  return (
    <Collapse in={notifications.length > 0}>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          width: '100%',
          backgroundColor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Alert
          severity="success"
          sx={{
            borderRadius: 0,
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              {otherCount > 0 && (
                <Typography variant="caption" color="text.secondary">
                  +{otherCount} more
                </Typography>
              )}
              {notifications.length > 1 && (
                <IconButton size="small" onClick={clearAll} sx={{ mr: 1 }}>
                  <Typography variant="caption" sx={{ textDecoration: 'underline' }}>
                    Clear all
                  </Typography>
                </IconButton>
              )}
              <IconButton size="small" onClick={() => dismissNotification(latestNotification.id)}>
                <Close fontSize="small" />
              </IconButton>
            </Stack>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            New field "{latestNotification.fieldName}" has been created and assigned to the Assigned Fields table
          </Typography>
        </Alert>
      </Box>
    </Collapse>
  );
};

export default FieldNotificationBar;
