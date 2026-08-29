import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { Link, useNavigate, useParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { Form } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardList,
  faCopy,
  faEdit,
  faPlus,
  faShareNodes,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/modals/ConfirmModal";
import GallerySubmitModal from "@/components/modals/GallerySubmitModal";
import ActionDropdown from "@/components/ActionDropdown";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import Table from "@/components/Table";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_FORMS } from "@/lib/feature-flags";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

const FormsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const navigate = useNavigate();
  const { selectGuild, selectedGuild } = useGuildStore();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningFormId, setCloningFormId] = useState<number | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    id: number;
    name: string;
  } | null>(null);
  const [gallerySubmitForm, setGallerySubmitForm] = useState<Form | null>(null);
  const { locked: polledLock } = useFeatureLock(FEATURE_FORMS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const handleApiError = useApiErrorHandler(
    "Form management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit (unlike forms create.tsx), so a forced lock from a
  // 503 must release once the poll confirms the flag is back on, otherwise the
  // page stays locked forever after a single incident even though the flag was
  // re-enabled.
  useEffect(() => {
    if (polledLock === false) {
      setForcedLock(false);
    }
  }, [polledLock]);

  // Announce the lock lifting mid-session (e.g. a flag re-enabled while this page
  // is open). The banner's own aria-live region only reliably announces the
  // unlocked-to-locked transition (see FeatureLockBanner), so the reverse gets a
  // toast instead. Guarded so it never fires on mount, only on a genuine flip.
  const previousLockRef = useRef(isLocked);
  useEffect(() => {
    if (previousLockRef.current && !isLocked) {
      toast.success("Form changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 2) {
        toast.warning(
          "You do not have permission to manage this server's forms. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  useEffect(() => {
    const fetchForms = async () => {
      setLoading(true);
      try {
        const response = await apiClient.forms.getByGuild(guildId);
        setForms(response.data || []);
      } catch (error) {
        console.error("Failed to fetch forms:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, [guildId]);

  const handleDelete = async () => {
    if (!deleteModal || isLocked) return;

    try {
      await apiClient.forms.delete(guildId, deleteModal.id.toString(), SKIP_ERROR_TOAST);
      setForms((prev) => prev.filter((f) => f.form_id !== deleteModal.id));
      toast.success("Form deleted successfully");
    } catch (error) {
      handleApiError(error, "Failed to delete form. Please try again.");
      console.error("Failed to delete:", error);
    }

    setDeleteModal(null);
  };

  const handleClone = async (form: Form) => {
    if (isLocked) return;

    setCloningFormId(form.form_id);
    try {
      const cloneTitle = `${form.title} (Copy)`.slice(0, 45);
      const createRes = await apiClient.forms.create(
        guildId,
        { title: cloneTitle },
        SKIP_ERROR_TOAST,
      );
      const newForm = createRes.data;

      if (form.inputs && form.inputs.length > 0) {
        const inputsToCreate = form.inputs.map((input) => ({
          label: input.label,
          description: input.description || null,
          placeholder: input.placeholder || null,
          type: input.type,
          position: input.position,
          style: input.style ?? 1,
          required: input.required,
          min_length: input.min_length,
          max_length: input.max_length,
          options: (input.options || []).map((opt) => ({
            label: opt.label,
            description: opt.description,
            value: opt.value,
          })),
        }));

        try {
          await apiClient.forms.updateInputs(
            guildId,
            newForm.form_id.toString(),
            {
              create: inputsToCreate,
              update: [],
              delete: [],
            } as never,
            SKIP_ERROR_TOAST,
          );
        } catch (error) {
          await apiClient.forms.delete(guildId, newForm.form_id.toString()).catch(() => {});
          throw error;
        }
      }

      toast.success("Form cloned");
      navigate(`/manage/${guildId}/forms/edit/${newForm.form_id}`);
    } catch (error) {
      handleApiError(error, "Failed to clone form. Please try again.");
      console.error("Failed to clone form:", error);
    } finally {
      setCloningFormId(null);
    }
  };

  if (loading) {
    return (
      <MainLayout
        title={`Forms for ${selectedGuild?.name || "loading..."}`}
        subtitle="Create and manage forms to collect information from users"
      >
        <FeatureLockBanner
          id="form-lock-banner"
          locked={isLocked}
          featureLabel="Form changes"
          existingLabel="forms"
        />
        <TableSkeleton rows={4} columns={3} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Forms for ${selectedGuild?.name || "loading..."}`}
      subtitle="Create and manage forms to collect information from users"
    >
      <FeatureLockBanner
        id="form-lock-banner"
        locked={isLocked}
        featureLabel="Form changes"
        existingLabel="forms"
      />
      <div className="bg-gray-800 rounded-xl overflow-hidden mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
          <h2 className="text-xl font-medium">Forms</h2>
          <Link to={isLocked ? "#" : `/manage/${guildId}/forms/create`}>
            <Button variant="primary" disabled={isLocked}>
              <FontAwesomeIcon icon={faPlus} /> Create Form
            </Button>
          </Link>
        </div>
        <hr className="text-gray-700" />
        <div className="p-4">
          {forms.length === 0 ? (
            <EmptyState
              icon={faClipboardList}
              title="No forms yet"
              description="Forms collect information from users when they open a ticket."
              action={{
                label: "Create Form",
                onClick: () => {
                  if (isLocked) return;
                  navigate(`/manage/${guildId}/forms/create`);
                },
                icon: faPlus,
              }}
            />
          ) : (
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>Form Title</Table.HeaderCell>
                  <Table.HeaderCell>Fields</Table.HeaderCell>
                  <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">
                    Action
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {forms.map((form) => (
                  <Table.Row key={form.form_id}>
                    <Table.Cell>{form.title}</Table.Cell>
                    <Table.Cell>{form.inputs?.length || 0} fields</Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end">
                        <ActionDropdown
                          items={[
                            {
                              label: "Edit",
                              icon: faEdit,
                              onClick: () =>
                                navigate(`/manage/${guildId}/forms/edit/${form.form_id}`),
                            },
                            {
                              label: cloningFormId === form.form_id ? "Cloning..." : "Clone",
                              icon: faCopy,
                              onClick: () => handleClone(form),
                              disabled: cloningFormId === form.form_id || isLocked,
                            },
                            {
                              label: "Publish to Gallery",
                              icon: faShareNodes,
                              onClick: () => setGallerySubmitForm(form),
                            },
                            {
                              label: "Remove",
                              icon: faTrash,
                              onClick: () =>
                                setDeleteModal({
                                  isOpen: true,
                                  id: form.form_id,
                                  name: form.title,
                                }),
                              variant: "danger",
                              disabled: isLocked,
                            },
                          ]}
                        />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteModal}
        title="Confirm Deletion"
        message={`Are you sure you want to delete the form "${deleteModal?.name || ""}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />

      {gallerySubmitForm && (
        <GallerySubmitModal
          itemType="form"
          itemId={gallerySubmitForm.form_id}
          itemTitle={gallerySubmitForm.title}
          guildId={guildId}
          open={!!gallerySubmitForm}
          onClose={() => setGallerySubmitForm(null)}
        />
      )}
    </MainLayout>
  );
};

export default FormsPage;
