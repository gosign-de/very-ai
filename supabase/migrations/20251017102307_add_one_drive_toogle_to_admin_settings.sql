-- Add OneDrive feature toggle to admin_settings table
-- This allows admins to enable/disable the OneDrive file picker feature

INSERT INTO admin_settings (key, value, description)
VALUES (
  'onedrive_enabled',
  'false',
  'Enable or disable OneDrive file picker integration. Set to "true" to enable, "false" to disable.'
)
ON CONFLICT (key) DO NOTHING;