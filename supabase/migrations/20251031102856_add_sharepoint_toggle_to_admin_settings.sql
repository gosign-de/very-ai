-- Add SharePoint feature toggle to admin_settings table
-- This allows admins to enable/disable the SharePoint file picker feature

INSERT INTO admin_settings (key, value, description)
VALUES (
  'sharepoint_enabled',
  'false',
  'Enable or disable SharePoint file picker integration. Set to "true" to enable, "false" to disable.'
)
ON CONFLICT (key) DO NOTHING;