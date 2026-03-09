class GroupState {
  private static instance: GroupState;
  private selectedGroup: string | null = null;
  private listeners: Array<(group: string | null) => void> = [];

  private constructor() {
    if (typeof window !== "undefined") {
      this.selectedGroup = sessionStorage.getItem("selectedGroup") || null;
    }
  }

  static getInstance() {
    if (!GroupState.instance) {
      GroupState.instance = new GroupState();
    }
    return GroupState.instance;
  }

  getSelectedGroup() {
    return this.selectedGroup;
  }

  setSelectedGroup(group: string | null) {
    this.selectedGroup = group;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("selectedGroup", group);
    }
    this.notifyListeners();
  }

  subscribe(listener: (group: string | null) => void) {
    this.listeners.push(listener);
  }

  unsubscribe(listener: (group: string | null) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.selectedGroup));
  }
}

export default GroupState.getInstance();
