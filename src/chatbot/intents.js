/**
 * Intent definitions for the rule-based assistant.
 * Each intent: id, keyword patterns (regex on lowercased text), and whether it
 * needs the authenticated user or live database data (resolved in chatService).
 */
export const INTENTS = [
  {
    id: "greeting",
    patterns: [/^(hi|hello|hey|good (morning|afternoon|evening)|namaste)\b/],
  },
  {
    id: "capabilities",
    patterns: [/\b(what can you do|help me|your features|who are you|what are you)\b/],
  },
  {
    id: "room_request_help",
    patterns: [
      /\b(how|steps?|way|process)\b.*\b(request|apply|get|book)\b.*\b(room|hostel|accommodation|bed)\b/,
      /\b(room|hostel|accommodation)\b.*\b(request|application|apply)\b/,
    ],
  },
  {
    id: "my_allocation_status",
    patterns: [
      /\b(my|current)\b.*\b(allocation|room|allotment)\b.*\b(status|update|progress)\b/,
      /\b(status|update)\b.*\b(my|current)\b.*\b(allocation|room|allotment|request)\b/,
      /\bhave i been (allocated|allotted|assigned)\b/,
      /\bmy room request\b/,
    ],
    needsUser: true,
  },
  {
    id: "room_availability",
    patterns: [
      /\b(which|what|any|show|list)\b.*\b(rooms?|beds?)\b.*\b(available|free|vacant|empty)\b/,
      /\b(available|free|vacant)\b.*\b(rooms?|beds?)\b/,
      /\broom availability\b/,
    ],
    needsData: true,
  },
  {
    id: "complaint_help",
    patterns: [
      /\b(how|steps?|way|where)\b.*\b(raise|submit|file|register|write|post|make)\b.*\b(complaint|issue|problem)\b/,
      /\bcomplaint\b.*\b(how|where|submit|file|raise)\b/,
    ],
  },
  {
    id: "my_complaints",
    patterns: [
      /\b(my|open|pending)\b.*\b(complaints?|issues?)\b/,
      /\b(status|track)\b.*\b(my\b.*\b)?complaint\b/,
      /\bhow many complaints\b/,
    ],
    needsUser: true,
  },
  {
    id: "complaint_status_meaning",
    patterns: [
      /\bwhat does\b.*\b(submitted|assigned|in progress|resolved|closed|reopened)\b.*\bmean\b/,
      /\bmeaning of\b.*\bstatus\b/,
    ],
  },
  {
    id: "contact_warden",
    patterns: [
      /\b(contact|reach|call|meet|find)\b.*\b(warden|staff|admin|office|hostel office)\b/,
      /\bwho (do i|should i) contact\b/,
    ],
  },
  {
    id: "password_help",
    patterns: [/\b(forgot|reset|change)\b.*\b(password)\b/, /\bpassword\b.*\b(help|change|reset)\b/],
  },
  {
    id: "maintenance_help",
    patterns: [/\b(maintenance|repair|broken|leak|fan|light|plumbing)\b/],
  },
  {
    id: "wifi_help",
    patterns: [/\b(wifi|wi-fi|internet|network|broadband)\b/],
  },
  {
    id: "water_help",
    patterns: [/\b(water|geyser|tap|shower|drinking water)\b/],
  },
  {
    id: "electricity_help",
    patterns: [/\b(electricity|power|current|outage|socket|switch)\b/],
  },
  {
    id: "cleanliness_help",
    patterns: [/\b(clean|cleaning|cleanliness|housekeeping|dirty|mess hygiene|pest)\b/],
  },
  {
    id: "fees_help",
    patterns: [/\b(fees?|payment|charges|rent|dues)\b/],
  },
  {
    id: "rules_help",
    patterns: [/\b(rules?|regulations?|curfew|discipline|policy|policies|visitor|ragging)\b/],
  },
  {
    id: "reports_help",
    patterns: [/\b(report|reports|occupancy|statistics|stats|export|csv)\b/],
  },
  {
    id: "thanks",
    patterns: [/^(thanks|thank you|thx|ty)\b/, /\b(thank you|thanks a lot)\b/],
  },
];

export function detectIntent(text) {
  const lower = text.toLowerCase();
  for (const intent of INTENTS) {
    if (intent.patterns.some((re) => re.test(lower))) return intent;
  }
  return null;
}
