/**
 * Signature Result Formatter
 *
 * Formats the raw JSON response from the signature verification n8n workflow
 * into a human-readable markdown string for display in the chat.
 *
 * Extracted from use-chat-handler.tsx for better separation of concerns.
 */

export const formatSignatureResult = (result: any): string => {
  if (typeof result === "string") {
    // Try to parse if it's a JSON string
    try {
      result = JSON.parse(result);
    } catch {
      return result;
    }
  }

  const lines: string[] = [];
  let data = result;

  // Extract text response and any embedded JSON
  if (result.response) {
    let responseText = result.response;

    // Check if response contains embedded JSON (text followed by JSON)
    const jsonMatch = responseText.match(/^([\s\S]*?)(\{[\s\S]*\})$/);
    if (jsonMatch) {
      responseText = jsonMatch[1].trim();
      try {
        const embeddedData = JSON.parse(jsonMatch[2]);
        data = { ...result, ...embeddedData };
      } catch {
        // Keep original data if parsing fails
      }
    }

    if (responseText) {
      lines.push("## 📋 Analysis Result\n");
      lines.push(responseText);
      lines.push("");
    }
  }

  // Summary section
  lines.push("\n---\n## 📊 Summary\n");

  // Total detected locations
  if (data.total_detected_locations !== undefined) {
    lines.push(
      `**Total Signature Locations:** ${data.total_detected_locations}\n`,
    );
  }

  // Role estimation
  if (data.role_estimation) {
    const role = data.role_estimation;
    const confidenceEmoji =
      role.confidence === "High"
        ? "🟢"
        : role.confidence === "Medium"
          ? "🟡"
          : "🔴";
    lines.push(`### 👤 Role Estimation\n`);
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| **Role** | ${role.role || "Unknown"} |`);
    lines.push(
      `| **Confidence** | ${confidenceEmoji} ${role.confidence || "Unknown"} |`,
    );
    if (role.rationale) {
      lines.push(`\n> **Rationale:** ${role.rationale}`);
    }
  }

  // Signatures report
  if (
    data.signatures_report &&
    Array.isArray(data.signatures_report) &&
    data.signatures_report.length > 0
  ) {
    lines.push("\n---\n## 🖊️ Signatures Report\n");

    // Create a table
    lines.push("| # | Page | Status | Similarity | Intended |");
    lines.push("|:-:|:----:|:------:|:----------:|:--------:|");

    data.signatures_report.forEach((sig: any) => {
      const statusEmoji =
        sig.status === "signed"
          ? "✅"
          : sig.status === "unsigned"
            ? "⬜"
            : "❓";
      const similarity =
        sig.similarity_to_reference_percent != null &&
        typeof sig.similarity_to_reference_percent === "number"
          ? `${sig.similarity_to_reference_percent.toFixed(1)}%`
          : "N/A";
      const intended = sig.intended_for_me?.is_intended === true ? "✅" : "❌";

      lines.push(
        `| ${sig.id || "-"} | ${sig.page_number || "-"} | ${statusEmoji} | ${similarity} | ${intended} |`,
      );
    });

    // Detailed breakdown (collapsible)
    lines.push(
      "\n<details>\n<summary><strong>📝 View Detailed Breakdown</strong></summary>\n",
    );
    data.signatures_report.forEach((sig: any, index: number) => {
      const statusEmoji =
        sig.status === "signed"
          ? "✅"
          : sig.status === "unsigned"
            ? "⬜"
            : "❓";
      lines.push(
        `\n#### Signature ${sig.id || index + 1} - ${statusEmoji} ${sig.status || "Unknown"}\n`,
      );
      lines.push(`- **Page:** ${sig.page_number || "?"}`);
      if (sig.position_bbox) {
        lines.push(`- **Position:** \`${sig.position_bbox}\``);
      }
      if (
        sig.similarity_to_reference_percent != null &&
        typeof sig.similarity_to_reference_percent === "number"
      ) {
        lines.push(
          `- **Similarity:** ${sig.similarity_to_reference_percent.toFixed(2)}%`,
        );
      }
      if (sig.intended_for_me) {
        lines.push(
          `- **Intended for Me:** ${sig.intended_for_me.is_intended ? "Yes" : "No"}`,
        );
        if (sig.intended_for_me.rationale) {
          lines.push(`- **Rationale:** ${sig.intended_for_me.rationale}`);
        }
      }
    });
    lines.push("\n</details>");
  }

  // Raw JSON (collapsible, pretty-printed)
  lines.push(
    "\n---\n<details>\n<summary><strong>📄 View Raw JSON</strong></summary>\n",
  );
  lines.push("\n```json");
  lines.push(JSON.stringify(data, null, 2));
  lines.push("```\n</details>");

  return lines.join("\n");
};

/**
 * Format a generic webhook response for signature assistants.
 * This wraps the result with a header appropriate for signature analysis.
 */
export const formatSignatureAnalysisResponse = (
  result: any,
  isError: boolean = false,
): string => {
  if (isError) {
    return `# ❌ Signature Analysis Error\n\n${typeof result === "string" ? result : JSON.stringify(result)}`;
  }
  return `# 🖊️ Signature Analysis\n\n${formatSignatureResult(result)}`;
};
