import { useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { FormInput } from "@/types";
import TextInput from "@/components/TextInput";
import Button from "@/components/Button";
import FormInputRow from "@/components/FormInputRow";

interface FormDraft {
  form_id: number;
  title: string;
  inputs: FormInput[];
  saved: boolean;
}

interface FormInputPayload {
  label: string;
  type: number;
  position: number;
  required: boolean;
  min_length: number;
  max_length: number;
  style?: number;
  placeholder?: string;
  description?: string;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
}

interface FormsStepProps {
  guildId: string;
  existingForms: Array<{ form_id: number; title: string }>;
  onFormsChange: (forms: Array<{ form_id: number; title: string }>) => void;
}

export interface FormsStepRef {
  save: () => Promise<void>;
}

let nextTempId = -1;

function createDefaultInput(formId: number, position: number): FormInput {
  return {
    id: nextTempId--,
    form_id: formId,
    type: 4,
    position,
    custom_id: "",
    style: 1,
    label: "",
    required: true,
    min_length: 0,
    max_length: 1024,
  };
}

const FormsStep = forwardRef<FormsStepRef, FormsStepProps>(
  ({ guildId, existingForms, onFormsChange }, ref) => {
    const [forms, setForms] = useState<FormDraft[]>(
      existingForms.map((f) => ({
        form_id: f.form_id,
        title: f.title,
        inputs: [],
        saved: true,
      })),
    );
    const [newFormTitle, setNewFormTitle] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateForm = useCallback(async () => {
      const trimmed = newFormTitle.trim();
      if (!trimmed) return;

      setIsCreating(true);
      try {
        const res = await apiClient.forms.create(guildId, { title: trimmed });
        const form = res.data;
        const draft: FormDraft = {
          form_id: form.form_id,
          title: form.title,
          inputs: [],
          saved: true,
        };
        setForms((prev) => {
          const next = [...prev, draft];
          onFormsChange(next.map((f) => ({ form_id: f.form_id, title: f.title })));
          return next;
        });
        setNewFormTitle("");
        toast.success("Form created");
      } catch {
        toast.error("Failed to create form");
      } finally {
        setIsCreating(false);
      }
    }, [guildId, newFormTitle, onFormsChange]);

    const addInput = useCallback((formId: number) => {
      setForms((prev) =>
        prev.map((f) => {
          if (f.form_id !== formId || f.inputs.length >= 5) return f;
          return {
            ...f,
            saved: false,
            inputs: [...f.inputs, createDefaultInput(formId, f.inputs.length + 1)],
          };
        }),
      );
    }, []);

    const removeInput = useCallback((formId: number, idx: number) => {
      setForms((prev) =>
        prev.map((f) => {
          if (f.form_id !== formId) return f;
          const newInputs = f.inputs
            .filter((_, i) => i !== idx)
            .map((input, i) => ({ ...input, position: i + 1 }));
          return { ...f, saved: false, inputs: newInputs };
        }),
      );
    }, []);

    const updateInput = useCallback((formId: number, idx: number, updated: FormInput) => {
      setForms((prev) =>
        prev.map((f) => {
          if (f.form_id !== formId) return f;
          return {
            ...f,
            saved: false,
            inputs: f.inputs.map((input, i) =>
              i === idx ? { ...updated, position: i + 1 } : input,
            ),
          };
        }),
      );
    }, []);

    const moveInput = useCallback((formId: number, idx: number, direction: "up" | "down") => {
      setForms((prev) =>
        prev.map((f) => {
          if (f.form_id !== formId) return f;
          const newInputs = [...f.inputs];
          const swapIdx = direction === "up" ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= newInputs.length) return f;
          [newInputs[idx], newInputs[swapIdx]] = [newInputs[swapIdx], newInputs[idx]];
          newInputs.forEach((input, i) => {
            input.position = i + 1;
          });
          return { ...f, saved: false, inputs: newInputs };
        }),
      );
    }, []);

    const saveAllInputs = useCallback(async () => {
      for (const form of forms) {
        if (form.inputs.length > 0 && !form.saved) {
          const payload = form.inputs.map((input, idx) => {
            const item: FormInputPayload = {
              label: input.label,
              type: input.type,
              position: idx + 1,
              required: input.required,
              min_length: input.min_length || 0,
              max_length: input.max_length || (input.type === 4 ? 1024 : 10),
            };

            if (input.type === 4) {
              item.style = input.style || 1;
            }

            if (input.placeholder && input.placeholder.trim().length > 0) {
              item.placeholder = input.placeholder;
            }

            if (input.description && input.description.trim().length > 0) {
              item.description = input.description;
            }

            if (input.options && input.options.length > 0) {
              item.options = input.options.map((opt) => ({
                label: opt.label,
                value: opt.value,
                ...(opt.description ? { description: opt.description } : {}),
              }));
            }

            return item;
          });

          try {
            await apiClient.forms.updateInputs(guildId, form.form_id.toString(), {
              create: payload,
              update: [],
              delete: [],
            });
          } catch {
            toast.error(`Failed to save fields for "${form.title}"`);
            throw new Error("Failed to save form inputs");
          }
        }
      }
      setForms((prev) => prev.map((f) => ({ ...f, saved: true })));
    }, [forms, guildId]);

    useImperativeHandle(ref, () => ({ save: saveAllInputs }), [saveAllInputs]);

    const hasUnsavedInputs = useMemo(
      () => forms.some((f) => !f.saved && f.inputs.length > 0),
      [forms],
    );

    return (
      <div>
        {forms.map((form) => (
          <div key={form.form_id} className="mb-4 rounded-lg bg-gray-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">{form.title}</h3>
              {!form.saved && <span className="text-xs text-amber-400">Unsaved changes</span>}
            </div>

            {form.inputs.map((input, idx) => (
              <FormInputRow
                key={input.id}
                data={input}
                formId={form.form_id}
                index={idx}
                formLength={form.inputs.length}
                withDeleteButton
                withDirectionButtons
                onDelete={() => removeInput(form.form_id, idx)}
                onMove={(dir) => moveInput(form.form_id, idx, dir)}
                onChange={(updated) => updateInput(form.form_id, idx, updated)}
              />
            ))}

            {form.inputs.length < 5 ? (
              <Button
                variant="dashed"
                onClick={() => addInput(form.form_id)}
                className="mt-3 w-full text-sm"
              >
                + Add Field
              </Button>
            ) : (
              <p className="mt-3 text-center text-xs text-gray-500">Maximum of 5 fields reached</p>
            )}

            {form.inputs.length === 0 && (
              <p className="text-sm text-gray-500">
                No fields yet. Add fields to collect information when users open a ticket.
              </p>
            )}
          </div>
        ))}

        <div className="rounded-lg border border-dashed border-gray-600 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextInput
                label="Form title"
                value={newFormTitle}
                onChange={setNewFormTitle}
                placeholder="e.g. Support Request"
                maxLength={45}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleCreateForm}
              disabled={!newFormTitle.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>

        {hasUnsavedInputs && (
          <p className="mt-3 text-xs text-gray-500">
            Form fields will be saved when you proceed to the next step.
          </p>
        )}
      </div>
    );
  },
);

FormsStep.displayName = "FormsStep";

export default FormsStep;
