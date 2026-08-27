import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useParams, useNavigate } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { Form, FormInput } from "@/types";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import FormInputRow from "@/components/FormInputRow";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_FORMS } from "@/lib/feature-flags";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";

interface ExtendedFormInput extends FormInput {
  is_new?: boolean;
  placeholder?: string;
}

/** Extracts the status and API-supplied message from an Axios error, for the 503 lock check. */
function readApiError(error: unknown): { status?: number; message?: string } {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return { status, message };
}

const EditFormPage: FC = () => {
  const navigate = useNavigate();
  let { guildId, formId } = useParams();
  guildId = guildId!;
  formId = formId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const [form, setForm] = useState<Form | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [renamedTitle, setRenamedTitle] = useState("");
  const [toDelete, setToDelete] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [inputValidationErrors, setInputValidationErrors] = useState<Record<number, boolean>>({});
  const { locked: polledLock } = useFeatureLock(FEATURE_FORMS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived editor rather than a form the user navigates away
  // from after one submit (renaming the title, for instance, leaves the user on
  // this page), so a forced lock from a 503 must release once the poll confirms
  // the flag is back on, otherwise the page stays locked forever after a single
  // incident even though the flag was re-enabled.
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
    const fetchForm = async () => {
      try {
        const response = await apiClient.forms.getByGuild(guildId);
        const forms = response.data || [];
        const currentForm = forms.find((f: Form) => f.form_id.toString() === formId);

        if (currentForm) {
          setForm(currentForm);
          setRenamedTitle(currentForm.title);
        } else {
          toast.error("Form not found");
          navigate(`/manage/${guildId}/forms`);
        }
      } catch (error) {
        console.error("Failed to fetch form:", error);
      }
    };

    fetchForm();
  }, [guildId, formId, navigate]);

  const updateTitle = async () => {
    if (!form || isLocked) return;

    try {
      await apiClient.forms.update(guildId, formId, { title: renamedTitle }, SKIP_ERROR_TOAST);
      setForm({ ...form, title: renamedTitle });
      setEditingTitle(false);
      toast.success("Form title updated");
    } catch (error) {
      const { status, message } = readApiError(error);
      if (status === 503) {
        toast.warning(
          message ?? "Form management is temporarily unavailable. Please try again shortly.",
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
        // status, not just 503, so every other failure needs its own here.
        toast.error(message ?? "Failed to update form title. Please try again.");
      }
      console.error("Failed to update form title:", error);
    }
  };

  const addInput = () => {
    if (!form || form.inputs.length >= 5) return;

    const newInput: ExtendedFormInput = {
      id: Date.now(),
      form_id: form.form_id,
      position: form.inputs.length + 1,
      custom_id: `field_${Date.now()}`,
      style: 1,
      label: "",
      description: "",
      placeholder: "",
      required: true,
      min_length: 0,
      max_length: 255,
      is_new: true,
      type: 4,
      options: [],
    };

    setForm({
      ...form,
      inputs: [...form.inputs, newInput as FormInput],
    });
  };

  const deleteInput = (input: ExtendedFormInput) => {
    if (!form) return;

    const idx = form.inputs.findIndex((i) => i.id === input.id);
    const newInputs = [...form.inputs];
    newInputs.splice(idx, 1);

    for (let i = idx; i < newInputs.length; i++) {
      newInputs[i].position--;
    }

    setForm({ ...form, inputs: newInputs });
    setInputValidationErrors((prev) => {
      const next = { ...prev };
      delete next[input.id];
      return next;
    });

    if (!(input as ExtendedFormInput).is_new) {
      setToDelete([...toDelete, input.id]);
    }
  };

  const changePosition = (input: FormInput, direction: "up" | "down") => {
    if (!form) return;

    const idx = form.inputs.findIndex((i) => i.id === input.id);
    const newInputs = [...form.inputs];

    if (direction === "up" && idx > 0) {
      [newInputs[idx - 1].position, newInputs[idx].position] = [
        newInputs[idx].position,
        newInputs[idx - 1].position,
      ];
      [newInputs[idx - 1], newInputs[idx]] = [newInputs[idx], newInputs[idx - 1]];
    } else if (direction === "down" && idx < newInputs.length - 1) {
      [newInputs[idx + 1].position, newInputs[idx].position] = [
        newInputs[idx].position,
        newInputs[idx + 1].position,
      ];
      [newInputs[idx + 1], newInputs[idx]] = [newInputs[idx], newInputs[idx + 1]];
    }

    setForm({ ...form, inputs: newInputs });
  };

  const updateInput = (index: number, updatedInput: ExtendedFormInput) => {
    if (!form) return;

    const newInputs = [...form.inputs];
    newInputs[index] = updatedInput as FormInput;
    setForm({ ...form, inputs: newInputs });
  };

  const saveInputs = async () => {
    if (!form || isLocked) return;

    setIsSaving(true);

    const blankToUndefined = (str: string | undefined): string | undefined =>
      str?.trim() ? str : undefined;

    const data = {
      create: form.inputs
        .filter((i) => (i as ExtendedFormInput).is_new === true)
        .map((i) => {
          const input = i as ExtendedFormInput;
          return {
            ...input,
            style: parseInt(input.style?.toString() || "1"),
            placeholder: blankToUndefined(input.placeholder),
            max_length:
              input.type === 3 && !input.max_length && input.options?.length
                ? input.options.length
                : input.max_length,
          };
        }),
      update: form.inputs
        .filter((i) => !(i as ExtendedFormInput).is_new)
        .map((i) => {
          const input = i as ExtendedFormInput;
          return {
            ...input,
            style: parseInt(input.style?.toString() || "1"),
            placeholder: blankToUndefined(input.placeholder),
            max_length:
              input.type === 3 && !input.max_length && input.options?.length
                ? input.options.length
                : input.max_length,
          };
        }),
      delete: toDelete,
    };

    try {
      await apiClient.forms.updateInputs(guildId, formId, data, SKIP_ERROR_TOAST);
      setToDelete([]);

      const response = await apiClient.forms.getByGuild(guildId);
      const forms = response.data || [];
      const updatedForm = forms.find((f: Form) => f.form_id.toString() === formId);

      if (updatedForm) {
        setForm(updatedForm);
      }

      toast.success("Form updated successfully");
      navigate(`/manage/${guildId}/forms`);
    } catch (error) {
      const { status, message } = readApiError(error);
      if (status === 503) {
        toast.warning(
          message ?? "Form management is temporarily unavailable. Please try again shortly.",
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
        // status, not just 503, so every other failure needs its own here.
        toast.error(message ?? "Failed to save form fields. Please try again.");
      }
      console.error("Failed to save inputs:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteForm = async () => {
    if (
      !form ||
      isLocked ||
      !window.confirm(`Are you sure you want to delete the form "${form.title}"?`)
    ) {
      return;
    }

    try {
      await apiClient.forms.delete(guildId, formId, SKIP_ERROR_TOAST);
      toast.success("Form deleted successfully");
      navigate(`/manage/${guildId}/forms`);
    } catch (error) {
      const { status, message } = readApiError(error);
      if (status === 503) {
        toast.warning(
          message ?? "Form management is temporarily unavailable. Please try again shortly.",
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
        // status, not just 503, so every other failure needs its own here.
        toast.error(message ?? "Failed to delete form. Please try again.");
      }
      console.error("Failed to delete form:", error);
    }
  };

  if (!form) {
    return (
      <MainLayout title="Loading..." subtitle="Please wait">
        <FeatureLockBanner
          id="form-lock-banner"
          locked={isLocked}
          featureLabel="Form changes"
          existingLabel="forms"
        />
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-400">Loading form...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`Edit Form - ${form.title}`} subtitle="Manage form fields and settings">
      <FeatureLockBanner
        id="form-lock-banner"
        locked={isLocked}
        featureLabel="Form changes"
        existingLabel="forms"
      />
      <div className="bg-gray-800 rounded-xl overflow-hidden mb-8">
        <div className="p-4">
          <div className="mb-6">
            {editingTitle ? (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <TextInput
                    label="Form Title"
                    placeholder="Form Title"
                    value={renamedTitle}
                    onChange={setRenamedTitle}
                  />
                </div>
                <Button
                  variant="success"
                  onClick={updateTitle}
                  className="font-medium mb-0.5"
                  visuallyDisabled={isLocked}
                  aria-describedby={isLocked ? "form-lock-banner" : undefined}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} className="mr-2" />
                  Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setEditingTitle(false)}
                  className="font-medium mb-0.5"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Form Settings</h2>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setEditingTitle(true)}>
                    <FontAwesomeIcon icon={faEdit} className="mr-2" />
                    Rename Form
                  </Button>
                  <Button
                    variant="danger"
                    onClick={deleteForm}
                    visuallyDisabled={isLocked}
                    aria-describedby={isLocked ? "form-lock-banner" : undefined}
                  >
                    Delete Form
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-xl font-semibold mb-4">Form Fields</h3>

            {form.inputs.map((input, index) => (
              <FormInputRow
                key={input.id}
                data={input as ExtendedFormInput}
                formId={form.form_id}
                index={index}
                formLength={form.inputs.length}
                onDelete={() => deleteInput(input as ExtendedFormInput)}
                onMove={(direction) => changePosition(input, direction)}
                onChange={(updatedInput) => updateInput(index, updatedInput)}
                onValidationChange={(hasErrors) =>
                  setInputValidationErrors((prev) => ({ ...prev, [input.id]: hasErrors }))
                }
              />
            ))}

            {form.inputs.length < 5 && (
              <div className="flex justify-center items-center gap-4 mt-4">
                <hr className="flex-1 border-gray-600" />
                <Button variant="success" onClick={addInput}>
                  <FontAwesomeIcon icon={faPlus} />
                  New Field
                </Button>
                <hr className="flex-1 border-gray-600" />
              </div>
            )}

            {form.inputs.length >= 5 && (
              <div className="text-center text-gray-400 mt-4">Maximum of 5 fields reached</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="success"
          onClick={saveInputs}
          disabled={
            form.inputs.length === 0 ||
            isSaving ||
            Object.values(inputValidationErrors).some(Boolean)
          }
          visuallyDisabled={isLocked}
          aria-describedby={isLocked ? "form-lock-banner" : undefined}
          className="font-medium"
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </MainLayout>
  );
};

export default EditFormPage;
