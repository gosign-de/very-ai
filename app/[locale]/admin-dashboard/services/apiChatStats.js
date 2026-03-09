export async function getChatStats(period, modelName) {
  try {
    const response = await fetch("/api/chat-stats/get-chat-stats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ period, modelName }),
    });

    if (response.redirected) {
      return { redirected: true, url: response.url };
    }

    if (!response.ok) {
      return 0;
    }

    const result = await response.json();

    if (!result.success) {
      return 0;
    }

    const finalResult = result.data || 0;
    return finalResult;
  } catch {
    return 0;
  }
}

export async function getTopUsers(numDays, modelName) {
  try {
    const response = await fetch("/api/chat-stats/get-top-users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numDays, modelName }),
    });

    if (response.redirected) {
      return { redirected: true, url: response.url };
    }

    if (!response.ok) {
      return [];
    }

    const result = await response.json();

    if (!result.success) {
      return [];
    }

    const finalResult = result.data || [];
    return finalResult;
  } catch {
    return [];
  }
}export async function getUserStats(numDays, modelName, page) {
  try {
    const response = await fetch("/api/chat-stats/get-user-stats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numDays, modelName, page }),
    });

    if (response.redirected) {
      return { redirected: true, url: response.url };
    }

    if (!response.ok) {
      return [];
    }

    const result = await response.json();

    if (!result.success) {
      return [];
    }

    return result.data || [];
  } catch {
    return [];
  }
}

export async function getModelStats(period, modelName) {
  try {
    // Fetch aggregated model counts for pie chart
    const countsResponse = await fetch("/api/chat-stats/get-model-counts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ period, modelName }),
    });

    if (countsResponse.redirected) {
      return { redirected: true, url: countsResponse.url };
    }

    let modelCountStats = {};
    if (countsResponse.ok) {
      const countsResult = await countsResponse.json();
      if (countsResult.success && countsResult.data) {
        modelCountStats = countsResult.data;
      }
    }

    // Optionally fetch detailed stats if needed for other purposes
    const response = await fetch("/api/chat-stats/get-model-stats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ period, modelName }),
    });

    if (response.redirected) {
      return { redirected: true, url: response.url };
    }

    let modelStats = [];
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        modelStats = result.data;
      }
    }

    const finalResult = { modelStats, modelCountStats };

    return finalResult;
  } catch {
    return { modelStats: [], modelCountStats: {} };
  }
}

export async function getAssistantStats() {
  const response = await fetch("/api/chat-stats/get-assistant-stats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.redirected) {
    return { redirected: true, url: response.url };
  }

  const data = await response.json();

  const assistants = data.data.map(assistant => ({
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    type: assistant.group_id ? "group" : "private",
    createdAt: assistant.created_at,
    usageCount: assistant.chat_count,
    departmentGroup: assistant.group_name || "Private",
    author: assistant.email || "Unknown",
  }));

  return assistants;
}
