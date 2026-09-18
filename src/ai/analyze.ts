import OpenAI from "openai";
import { config } from "../config.js";
import type { ImpressionRow } from "../types.js";

export type AiAnalysis = {
  topicCluster: string;
  keywords: string[];
  possibleConnections: string[];
  responsibilityAreas: string[];
  recommendation: string;
  confidentialAdvice?: string;
};

const AI_GUARDRAIL = `You support perception and organization. You NEVER assume spiritual authority.
Always phrase recommendations as "Possible recommendation".
Never say "God says", "This is a warning from God", or claim prophetic certainty.
Distinguish perception from interpretation. Be pastoral and careful with sensitive content.`;

function ruleBasedAnalysis(impression: ImpressionRow): AiAnalysis {
  const text = `${impression.perceived} ${impression.interpretation ?? ""}`.toLowerCase();
  const keywords: string[] = [];
  const dictionary: Record<string, string[]> = {
    leadership: ["leader", "leadership", "elder", "pastor", "board", "workload"],
    youth: ["youth", "teen", "young", "identity", "belonging"],
    unity: ["unity", "division", "conflict", "reconcile"],
    prayer: ["pray", "prayer", "intercession", "burden"],
    healing: ["heal", "sickness", "illness", "hospital"],
    city: ["city", "society", "nation", "community"],
  };

  for (const [topic, words] of Object.entries(dictionary)) {
    if (words.some((w) => text.includes(w))) keywords.push(topic);
  }

  const topicCluster =
    keywords[0] ??
    `${impression.context} / ${impression.type}`.replaceAll("_", " ");

  const recommendations: string[] = [];
  if (impression.confidential) {
    recommendations.push(
      "Possible recommendation: Treat confidentially. Do not include in general intercessions. Have the responsible pastoral or leadership figure review it.",
    );
  } else if (keywords.includes("leadership")) {
    recommendations.push(
      "Possible recommendation: Submit to the leadership team for review. Do not communicate publicly. Inform the intercessory prayer team if necessary.",
    );
  } else {
    recommendations.push(
      "Possible recommendation: Review with leadership. Decide whether to monitor, create a prayer focus, or forward to the appropriate leader.",
    );
  }

  if (impression.urgency === "high") {
    recommendations.push(
      "Possible recommendation: Prioritize review due to marked urgency.",
    );
  }

  return {
    topicCluster,
    keywords: keywords.length ? keywords : [impression.type, impression.context],
    possibleConnections: [
      `Related context: ${impression.context}`,
      `Impression type: ${impression.type}`,
    ],
    responsibilityAreas: impression.confidential
      ? ["Pastoral / leadership only"]
      : ["Leadership team", "Intercession team"],
    recommendation: recommendations.join("\n"),
    confidentialAdvice: impression.confidential
      ? "Keep restricted visibility; do not auto-share."
      : undefined,
  };
}

export async function analyzeImpression(
  impression: ImpressionRow,
  recentSimilar: ImpressionRow[] = [],
): Promise<AiAnalysis> {
  if (!config.openaiApiKey) {
    return ruleBasedAnalysis(impression);
  }

  try {
    const client = new OpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    });
    const similar = recentSimilar
      .slice(0, 8)
      .map(
        (r) =>
          `#${r.id} [${r.topic_cluster ?? r.context}] ${r.perceived.slice(0, 180)}`,
      )
      .join("\n");

    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: AI_GUARDRAIL },
        {
          role: "user",
          content: `Analyze this watchman impression and return JSON with keys:
topicCluster (short string), keywords (string[]), possibleConnections (string[]),
responsibilityAreas (string[]), recommendation (string starting with "Possible recommendation"),
confidentialAdvice (string|null).

Impression:
- Perceived: ${impression.perceived}
- Interpretation (separate): ${impression.interpretation ?? "(none)"}
- Type: ${impression.type}
- Context: ${impression.context}
- Urgency: ${impression.urgency}
- Confidential: ${impression.confidential ? "yes" : "no"}
- Already prayed: ${impression.prayed ? "yes" : "no"}

Recent impressions for clustering context:
${similar || "(none)"}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AiAnalysis>;
    const fallback = ruleBasedAnalysis(impression);

    let recommendation =
      parsed.recommendation?.trim() || fallback.recommendation;
    if (!/^possible recommendation/i.test(recommendation)) {
      recommendation = `Possible recommendation: ${recommendation}`;
    }

    return {
      topicCluster: parsed.topicCluster?.trim() || fallback.topicCluster,
      keywords: parsed.keywords?.length ? parsed.keywords : fallback.keywords,
      possibleConnections: parsed.possibleConnections?.length
        ? parsed.possibleConnections
        : fallback.possibleConnections,
      responsibilityAreas: parsed.responsibilityAreas?.length
        ? parsed.responsibilityAreas
        : fallback.responsibilityAreas,
      recommendation,
      confidentialAdvice:
        parsed.confidentialAdvice ?? fallback.confidentialAdvice,
    };
  } catch {
    return ruleBasedAnalysis(impression);
  }
}

export function formatAiAnalysis(analysis: AiAnalysis): string {
  const lines = [
    `🧭 Topic: ${analysis.topicCluster}`,
    `🔑 Keywords: ${analysis.keywords.join(", ")}`,
    `🔗 Connections:`,
    ...analysis.possibleConnections.map((c) => `  • ${c}`),
    `👥 Areas: ${analysis.responsibilityAreas.join(", ")}`,
    "",
    analysis.recommendation,
  ];
  if (analysis.confidentialAdvice) {
    lines.push("", `🔒 ${analysis.confidentialAdvice}`);
  }
  lines.push(
    "",
    "_AI supports organization only — leadership discerns and decides._",
  );
  return lines.join("\n");
}
