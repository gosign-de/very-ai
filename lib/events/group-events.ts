// Custom event system for group updates
export const GROUP_EVENTS = {
  GROUPS_UPDATED: "managed-groups-updated",
} as const;

export const emitGroupsUpdated = () => {
  window.dispatchEvent(new CustomEvent(GROUP_EVENTS.GROUPS_UPDATED));
};

export const subscribeToGroupUpdates = (callback: () => void) => {
  window.addEventListener(GROUP_EVENTS.GROUPS_UPDATED, callback);

  // Return cleanup function
  return () => {
    window.removeEventListener(GROUP_EVENTS.GROUPS_UPDATED, callback);
  };
};
