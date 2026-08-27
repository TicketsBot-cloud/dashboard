import { Link, useLocation, useParams } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

const segmentLabels: Record<string, string> = {
  manage: "Manage",
  settings: "Settings",
  panels: "Panels",
  forms: "Forms",
  teams: "Staff Teams",
  tags: "Tags",
  kb: "Knowledge Base",
  tickets: "Tickets",
  transcripts: "Transcripts",
  analytics: "Analytics",
  blacklist: "Blacklist",
  integrations: "Integrations",
  "staff-override": "Staff Override",
  staffoverride: "Staff Override",
  "audit-log": "Audit Log",
  auditlog: "Audit Log",
  create: "Create",
  edit: "Edit",
  view: "View",
  "create-multi": "Create Multi-Panel",
  createmulti: "Create Multi-Panel",
  "edit-multi": "Edit Multi-Panel",
  editmulti: "Edit Multi-Panel",
  staff: "Staff",
  activate: "Activate",
  configure: "Configure",
};

export default function Breadcrumbs() {
  const location = useLocation();
  const { guildId } = useParams();

  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length <= 2) return null;

  const crumbs: { label: string; to: string }[] = [];
  let pathSoFar = "";

  for (const segment of segments) {
    pathSoFar += `/${segment}`;

    if (segment === "manage" || segment === guildId) continue;

    const label = segmentLabels[segment];
    if (label) {
      crumbs.push({ label, to: pathSoFar });
    }
  }

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <li key={crumb.to} className="flex items-center gap-1.5">
              {idx > 0 && (
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="text-gray-500 text-[10px]"
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span className="text-white" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className="text-gray-300 hover:text-white transition-colors">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
