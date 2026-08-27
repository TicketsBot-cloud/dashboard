import { useId, type FC } from "react";
import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import { DOCS_URL } from "@/lib/constants";

interface DashboardAccessRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DashboardAccessRequiredModal: FC<DashboardAccessRequiredModalProps> = ({
  isOpen,
  onClose,
}) => {
  const titleId = useId();

  return (
    <DismissibleModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
      ariaLabelledBy={titleId}
      unstyled
    >
      <div className="p-6 pr-12">
        <h2 id={titleId} className="text-xl font-semibold text-white mb-4">
          Dashboard Access Required
        </h2>

        <div className="space-y-5 text-gray-300 text-sm leading-relaxed">
          <p>
            For your server to appear on the dashboard, you need to be a designated{" "}
            <strong className="text-white">Support Representative</strong> or{" "}
            <strong className="text-white">Admin User</strong> for the Tickets bot in that server.
          </p>

          <section className="rounded-lg border-l-[3px] border-[#5865f2] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faCheckCircle} className="text-[#5865f2]" aria-hidden="true" />
              How to Check Your Role
            </h3>
            <p className="m-0">
              Run{" "}
              <code className="bg-black/30 text-amber-400 px-1.5 py-0.5 rounded font-mono text-xs">
                /viewstaff
              </code>{" "}
              in your server to see who has access.
            </p>
          </section>

          <section className="rounded-lg border-l-[3px] border-[#5865f2] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faUserShield} className="text-[#5865f2]" aria-hidden="true" />
              Permission Levels
            </h3>
            <ul className="list-disc pl-5 space-y-2 my-2">
              <li>
                <strong className="text-white">Support Representatives:</strong> Limited dashboard
                access to tickets they can see and the tags page.
              </li>
              <li>
                <strong className="text-white">Admin Users:</strong> Full access to the entire bot
                dashboard, including adding, changing, and removing settings and panels.
              </li>
            </ul>
            <p className="m-0 mt-3 text-sm">
              <a
                href={`${DOCS_URL}/setup/staff`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5865f2] hover:text-[#7289da] hover:underline"
              >
                Learn more about Support and Admin roles
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            </p>
          </section>

          <section className="rounded-lg border-l-[3px] border-amber-500 bg-amber-500/5 p-4">
            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
              <FontAwesomeIcon
                icon={faExclamationTriangle}
                className="text-amber-500"
                aria-hidden="true"
              />
              Important Notes
            </h3>
            <ul className="list-disc pl-5 space-y-2 my-0">
              <li>
                The Tickets dashboard{" "}
                <strong className="text-white">does not check for server permissions</strong>.
                Discord&apos;s Administrator permission no longer provides access.
              </li>
              <li>
                Ask your server owner or an existing Admin User to run{" "}
                <code className="bg-black/30 text-amber-400 px-1.5 py-0.5 rounded font-mono text-xs">
                  /addadmin @yourUsername
                </code>{" "}
                in your server.
              </li>
              <li>
                After being added as an Admin User or Support Representative, you may need to{" "}
                <Link
                  to="/logout"
                  className="text-[#5865f2] font-semibold hover:text-[#7289da] hover:underline"
                >
                  re-login
                </Link>{" "}
                to the dashboard for the changes to take effect.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </DismissibleModal>
  );
};

export default DashboardAccessRequiredModal;
