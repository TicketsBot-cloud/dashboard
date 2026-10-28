import { useId, useState, type FC, type ReactNode } from "react";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationTriangle, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { useGuildPremium } from "@/hooks/queries/useGuild";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { COMPONENTS_V2_BUILDER_FLAG } from "@/lib/feature-flags";
import {
  EMPTY_TREE_MESSAGE,
  MAX_COMPONENTS,
  applyClassicConversion,
  countBlocks,
  hasConvertibleClassicContent,
  validateComponentTree,
  type ClassicConversionSource,
  type V2Component,
} from "@/lib/component-tree";
import MessageModeToggle from "./MessageModeToggle";
import BuildPreviewTabs from "./BuildPreviewTabs";
import ComponentTreeBuilder from "./ComponentTreeBuilder";
import type { PickerPanel } from "./picker-panels";

interface PlacementProps {
  availablePanels: PickerPanel[];
  allPanels: PickerPanel[];
  /** From the multi-panel's own panel list, so it is right before guild panels have loaded. */
  unplacedPanelCount: number;
  selectMenuModeOn: boolean;
}

interface ComponentsV2SectionProps {
  guildId: string;
  isV2: boolean;
  storedIsV2: boolean;
  onV2Change: (isV2: boolean) => void;
  tree: V2Component[];
  onTreeChange: (tree: V2Component[]) => void;
  classicSource: ClassicConversionSource;
  conversionNotes?: string[];
  title: string;
  previewTitle: string;
  convertSuffix?: string;
  reserved: number;
  reservedNote?: string;
  requireContent?: boolean;
  allowAvatarPlaceholder?: boolean;
  preview: ReactNode;
  toggleNote?: ReactNode;
  placement?: PlacementProps;
  saveAttempted?: boolean;
}

const ComponentsV2Section: FC<ComponentsV2SectionProps> = ({
  guildId,
  isV2,
  storedIsV2,
  onV2Change,
  tree,
  onTreeChange,
  classicSource,
  conversionNotes = [],
  title,
  previewTitle,
  convertSuffix,
  reserved,
  reservedNote,
  requireContent,
  allowAvatarPlaceholder,
  preview,
  toggleNote,
  placement,
  saveAttempted = false,
}) => {
  const hintId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { enabled: builderEnabled } = useFeatureFlag(COMPONENTS_V2_BUILDER_FLAG, guildId);
  const { data: premiumState = null } = useGuildPremium(guildId, false);

  // The flag only hides the way into Components v2. A message stored in it can always switch back
  // and forth, so this follows the loaded mode rather than the current one.
  const canEnterV2 = builderEnabled === true || storedIsV2;
  const hasClassicContent = hasConvertibleClassicContent(classicSource);
  const issues = validateComponentTree(tree, {
    requireContent,
    reserved,
    allowAvatarPlaceholder,
    unplacedPanelCount: placement?.unplacedPanelCount,
  }).filter((issue) => saveAttempted || issue.message !== EMPTY_TREE_MESSAGE);
  const errors = [...new Set(issues.map((issue) => issue.message))];

  const runConversion = () => {
    const { converted, folded } = applyClassicConversion(
      classicSource,
      MAX_COMPONENTS - reserved,
      onTreeChange,
    );
    if (!converted) {
      toast.warning(
        "Nothing could be converted. Check your classic content's image and thumbnail URLs.",
      );
      return;
    }
    if (folded) {
      toast.warning("Some sections were merged to fit the component limit.");
    }
  };

  return (
    <>
      {(canEnterV2 || isV2) && (
        <div className="md:col-span-2">
          <MessageModeToggle
            mode={isV2 ? "components_v2" : "classic"}
            isPremium={!!premiumState?.premium}
            canEnterV2={canEnterV2}
            onChange={(mode) => onV2Change(mode === "components_v2")}
            legendSuffix={convertSuffix}
          />
          {toggleNote}
        </div>
      )}

      {isV2 && (
        <BuildPreviewTabs
          className="md:col-span-2 mb-1"
          build={
            <div className="pb-2 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-xl font-semibold">{title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  visuallyDisabled={!hasClassicContent}
                  aria-describedby={!hasClassicContent ? hintId : undefined}
                  onClick={() => (tree.length === 0 ? runConversion() : setConfirmOpen(true))}
                >
                  <FontAwesomeIcon
                    icon={faWandMagicSparkles}
                    className="mr-1.5"
                    aria-hidden="true"
                  />
                  Convert from classic
                  {convertSuffix && <span className="sr-only"> ({convertSuffix})</span>}
                </Button>
              </div>
              {!hasClassicContent && (
                <p id={hintId} className="text-xs text-gray-400 mt-1">
                  Add a title, description or image in Classic mode first, then convert it here.
                </p>
              )}
              <div className="mt-2">
                <ComponentTreeBuilder
                  components={tree}
                  onChange={onTreeChange}
                  allowAvatarPlaceholder={allowAvatarPlaceholder}
                  budgetUsed={countBlocks(tree)}
                  budgetMax={MAX_COMPONENTS - reserved}
                  budgetReservedNote={reservedNote}
                  availablePanels={placement?.availablePanels}
                  allPanels={placement?.allPanels}
                  selectMenuModeOn={placement?.selectMenuModeOn}
                  saveAttempted={saveAttempted}
                />
              </div>
              <div
                role="status"
                tabIndex={-1}
                data-missing={errors.length > 0 || undefined}
                className={
                  errors.length > 0
                    ? "mt-3 flex items-start gap-2 px-3 py-2 bg-red-900/30 border border-red-500/40 rounded text-red-400 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                    : undefined
                }
              >
                {errors.length > 0 && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      className="mt-1"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-medium">
                        {errors.length} {errors.length === 1 ? "problem" : "problems"} to fix before
                        saving
                      </p>
                      <ul className="mt-1 space-y-1">
                        {errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          }
          preview={
            <div>
              <span className="text-xl font-semibold">{previewTitle}</span>
              <div role="region" aria-label={previewTitle}>
                {preview}
              </div>
            </div>
          }
        />
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          runConversion();
        }}
        onCancel={() => setConfirmOpen(false)}
        title="Convert from classic?"
        message={
          <>
            <p>
              This replaces the current block layout with a fresh conversion of your classic
              content. Continue?
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {conversionNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
              <li>
                Any blocks you&apos;ve added manually in the builder that aren&apos;t part of the
                classic content will be discarded.
              </li>
            </ul>
          </>
        }
        confirmText="Convert and replace"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </>
  );
};

export default ComponentsV2Section;
