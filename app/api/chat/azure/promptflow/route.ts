export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { query, assistant } = await request.json();
    const url = process.env.AZURE_PF_ENDPOINT;
    const token = process.env.AZURE_PF_BEARER_TOKEN;
    let deployment_name = process.env.AZURE_TEAMS_DEPLOYMENT;

    if (assistant === "sharepoint") {
      deployment_name = process.env.AZURE_SHAREPOINT_DEPLOYMENT;
    } else if (assistant === "web") {
      deployment_name = process.env.AZURE_WEB_DEPLOYMENT;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "azureml-model-deployment": deployment_name,
      },
      body: JSON.stringify({
        query: `${query}`,
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          message: "Request failed with status " + response.status,
        }),
        { status: response.status },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify({ message: data.reply }), {
      status: 200,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return new Response(
      JSON.stringify({
        message: err.message || "An unexpected error occurred",
      }),
      { status: 500 },
    );
  }
}
