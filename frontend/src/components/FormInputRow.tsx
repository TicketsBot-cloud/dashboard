import { useState, useEffect, useRef, type FC } from "react";
import type { FormInput, FormInputOption } from "@/types";
import Button from "./Button";
import TextInput from "./TextInput";
import Select from "./Select";
import RangeSlider from "./RangeSlider";
import NumberInput from "./NumberInput";
import Textarea from "./Textarea";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faChevronDown, faTrash, faPlus } from "@fortawesome/free-solid-svg-icons";
import Slider from "./Slider";

interface ExtendedFormInput extends FormInput {
  is_new?: boolean;
  placeholder?: string;
}

interface FormInputRowProps {
  data: ExtendedFormInput;
  formId: number;
  withSaveButton?: boolean;
  withDeleteButton?: boolean;
  withDirectionButtons?: boolean;
  index: number;
  formLength: number;
  onDelete?: () => void;
  onMove?: (direction: "up" | "down") => void;
  onChange?: (updatedInput: ExtendedFormInput) => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const OPTION_TYPES = [3, 21, 22];

// Must match SecretHeaderMask on the API; sent back untouched to keep the stored secret.
const SECRET_HEADER_MASK = "••••••••";

const PLACEHOLDER_PATTERN = /%[\w|-]+%/g;
// Separate non-global copy: .test() on a global regex advances lastIndex between calls.
const PLACEHOLDER_TEST = /%[\w|-]+%/;

const API_PLACEHOLDERS: Array<[string, string]> = [
  ["%user_id%", "Discord ID of the user opening the ticket"],
  ["%username%", "Discord username"],
  ["%user_nickname%", "Server nickname, falls back to username"],
  ["%user_roles%", "Comma-separated role IDs"],
  ["%user_permission_level%", "everyone, support or admin"],
  ["%user_locale%", "The user's Discord language"],
  ["%guild_id%", "Discord server ID"],
  ["%panel_title%", "Title of the panel the ticket is being opened from"],
];

const AUTO_BODY_EXAMPLE = JSON.stringify(
  {
    guild_id: "1071167333265047653",
    panel_title: "Billing",
    user_id: "1325579039888511056",
    user_locale: "en-US",
    user_nickname: "Tyler",
    user_permission_level: "support",
    user_roles: ["1326631159987175577", "1330545905211932672"],
    username: "tyler",
  },
  null,
  2,
);

const PlaceholderReference: FC = () => (
  <details className="mt-2 rounded border border-gray-600 bg-gray-800/50">
    <summary className="cursor-pointer px-3 py-2 text-xs text-gray-300 select-none">
      Available placeholders ({API_PLACEHOLDERS.length}) - usable in the URL, header values and
      request body
    </summary>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 px-3 pb-3">
      {API_PLACEHOLDERS.map(([name, description]) => (
        <div key={name} className="flex items-baseline gap-2 text-xs">
          <code className="bg-gray-600 px-1 rounded shrink-0">{name}</code>
          <span className="text-gray-400">{description}</span>
        </div>
      ))}
    </div>
  </details>
);

const ValidationWarning: FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm mt-2"
  >
    <i className="fas fa-exclamation-triangle text-base" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

const FormInputRow: FC<FormInputRowProps> = ({
  data,
  withDeleteButton = true,
  withDirectionButtons = true,
  index,
  formLength,
  onDelete,
  onMove,
  onChange,
  onValidationChange,
}) => {
  const [input, setInput] = useState(data);
  const [isApiSelect, setIsApiSelect] = useState(input.api_config !== undefined);
  const [useCustomBody, setUseCustomBody] = useState(!!input.api_config?.body_template?.trim());
  const [revealedSecrets, setRevealedSecrets] = useState<Record<number, boolean>>({});

  const handleChange = (field: keyof ExtendedFormInput, value: unknown) => {
    const updatedInput = { ...input, [field]: value } as ExtendedFormInput;
    setInput(updatedInput);
    onChange?.(updatedInput);
  };

  // Validation
  const hasInvalidLabel =
    !input.label || input.label.trim().length === 0 || input.label.length > 45;
  const hasInvalidDescription = !!input.description && input.description.length > 100;
  const minOptionsRequired = input.type === 21 ? 2 : 1;
  const maxOptionsAllowed = input.type === 21 || input.type === 22 ? 10 : 25;
  const hasNoOptions =
    OPTION_TYPES.includes(input.type ?? 0) &&
    !(input.type === 3 && isApiSelect) &&
    (!input.options ||
      input.options.length < minOptionsRequired ||
      input.options.length > maxOptionsAllowed);
  const blankOptions = (() => {
    if (
      !input.options ||
      !OPTION_TYPES.includes(input.type ?? 0) ||
      (input.type === 3 && isApiSelect)
    )
      return [];
    return input.options
      .map((opt, index) => ({ opt, index }))
      .filter(({ opt }) => !opt.label?.trim() || !opt.value?.trim())
      .map(({ index }) => index + 1);
  })();
  const duplicateValues = (() => {
    if (!input.options || !OPTION_TYPES.includes(input.type ?? 0)) return [];
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    input.options.forEach((opt) => {
      if (opt.value?.trim()) {
        if (seen.has(opt.value)) {
          if (!dupes.includes(opt.value)) dupes.push(opt.value);
        } else seen.set(opt.value, 1);
      }
    });
    return dupes;
  })();
  const hasDuplicateValues = duplicateValues.length > 0;
  const hasInvalidApiConfig =
    input.type === 3 && isApiSelect && !input.api_config?.endpoint_url?.trim();
  const hasPlaceholderInHost = (() => {
    if (input.type !== 3 || !isApiSelect) return false;
    const url = input.api_config?.endpoint_url;
    if (!url) return false;
    const authority = url.split("://")[1]?.split(/[/?#]/)[0];
    return !!authority && PLACEHOLDER_TEST.test(authority);
  })();
  const bodyTemplateError = (() => {
    if (input.type !== 3 || !isApiSelect) return null;
    if (input.api_config?.method !== "POST" || !useCustomBody) return null;
    const template = input.api_config?.body_template;
    if (!template?.trim()) return "A request body is required when using a custom body.";
    try {
      JSON.parse(template.replace(PLACEHOLDER_PATTERN, "null"));
      return null;
    } catch {
      return "The request body must be valid JSON.";
    }
  })();
  const hasBlankOptions = blankOptions.length > 0;
  const hasValidationErrors =
    hasInvalidLabel ||
    hasInvalidDescription ||
    hasDuplicateValues ||
    hasNoOptions ||
    hasBlankOptions ||
    hasInvalidApiConfig ||
    hasPlaceholderInHost ||
    !!bodyTemplateError;

  const onValidationChangeRef = useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;

  useEffect(() => {
    onValidationChangeRef.current?.(hasValidationErrors);
  }, [hasValidationErrors]);

  const optionCount = input.options?.length ?? 0;
  const lengthCeiling = (() => {
    if (input.type === 4) return 4000;
    if (input.type === 22) return Math.min(10, optionCount || 10);
    if (input.type === 3 && !isApiSelect) return Math.min(25, optionCount || 25);
    return 25;
  })();
  const maxLength = Math.min(
    lengthCeiling,
    Math.max(1, input.max_length ?? (input.type === 4 ? 255 : 10)),
  );
  const minLength = Math.min(Math.max(0, input.min_length ?? 0), maxLength);

  const inputTypes = [
    { label: "Text Input", key: "4" },
    { label: "String Select", key: "3" },
    { label: "User Select", key: "5" },
    { label: "Role Select", key: "6" },
    { label: "Mentionable Select", key: "7" },
    { label: "Channel Select", key: "8" },
    { label: "Radio Group", key: "21" },
    { label: "Checkbox Group", key: "22" },
  ];

  const inputStyles = [
    { label: "Single-line", key: "1" },
    { label: "Multi-line", key: "2" },
  ];

  return (
    <div className="bg-gray-700 rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Field #{index + 1}</h3>
        <div className="flex gap-2">
          {withDirectionButtons && (
            <>
              <Button
                variant="primary"
                size="icon"
                onClick={() => onMove?.("up")}
                disabled={index === 0}
                aria-label="Move field up"
                title="Move field up"
              >
                <FontAwesomeIcon icon={faChevronUp} aria-hidden="true" />
              </Button>
              <Button
                variant="primary"
                size="icon"
                onClick={() => onMove?.("down")}
                disabled={index === formLength - 1}
                aria-label="Move field down"
                title="Move field down"
              >
                <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
              </Button>
            </>
          )}
          {withDeleteButton && (
            <Button
              variant="danger"
              size="icon"
              onClick={onDelete}
              aria-label="Delete field"
              title="Delete field"
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextInput
          label="Label"
          placeholder="Enter field label"
          value={input.label || ""}
          onChange={(value) => handleChange("label", value)}
        />
        <TextInput
          label="Placeholder"
          placeholder="Enter placeholder text (for text inputs)"
          value={input.placeholder || ""}
          onChange={(value) => handleChange("placeholder", value)}
        />
      </div>
      {hasInvalidLabel && (
        <ValidationWarning
          message={
            !input.label || input.label.trim().length === 0
              ? "Label is required"
              : `Label must be 45 characters or less (currently ${input.label.length})`
          }
        />
      )}

      <div className="mt-3">
        <TextInput
          label="Description (optional)"
          placeholder="Add a description to help users understand this field"
          value={input.description || ""}
          onChange={(value) => handleChange("description", value)}
        />
      </div>
      {hasInvalidDescription && (
        <ValidationWarning
          message={`Description must be 100 characters or less (currently ${input.description!.length})`}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Select
          label="Type"
          options={inputTypes}
          value={input.type?.toString() || "4"}
          onChange={(value) => {
            const newType = parseInt(value ?? "");
            const optionTypes = [3, 21, 22];
            const updated = {
              ...input,
              type: newType,
              options: optionTypes.includes(newType) ? (input.options ?? []) : undefined,
              api_config: newType === 3 ? input.api_config : undefined,
            } as ExtendedFormInput;

            if (newType !== 3) setIsApiSelect(false);
            setInput(updated);
            onChange?.(updated);
          }}
        />

        {input.type === 4 && (
          <Select
            label="Style"
            options={inputStyles}
            value={input.style?.toString() || "1"}
            onChange={(value) => handleChange("style", parseInt(value ?? ""))}
          />
        )}

        <div className="flex gap-4">
          <Slider
            label="Required"
            value={input.required}
            onChange={(e) => handleChange("required", e)}
          />
          {input.type == 3 && (
            <Slider
              label="API Config"
              value={isApiSelect}
              onChange={(e) => {
                setIsApiSelect(e);
                if (e) {
                  const apiConfig = input.api_config ?? {
                    endpoint_url: "",
                    method: "GET",
                    cache_duration_seconds: 0,
                    headers: [],
                  };
                  handleChange("api_config", apiConfig);
                } else {
                  handleChange("api_config", undefined);
                }
              }}
            />
          )}
        </div>
      </div>

      {input.type !== 21 && (
        <div className="mt-3">
          <RangeSlider
            label={input.type == 4 ? "Length Range" : "Items Range"}
            min={0}
            max={lengthCeiling}
            maxFloor={1}
            value={[minLength, maxLength]}
            onChange={([min, max]) => {
              const updated = { ...input, min_length: min, max_length: max };
              setInput(updated);
              onChange?.(updated);
            }}
            minLabel="Min"
            maxLabel="Max"
          />
          {input.type === 3 && isApiSelect && (
            <p className="text-xs text-gray-400 mt-1">
              Discord caps the selection at however many options your API returns, so a range above
              that count is trimmed when the form opens.
            </p>
          )}
        </div>
      )}

      {input.type === 3 && isApiSelect && (
        <div className="mt-3">
          <h4 className="text-sm font-medium text-gray-300 mb-2">API Configuration</h4>
          <TextInput
            label="API Endpoint URL *"
            placeholder="https://api.example.com/options?user=%user_id%"
            value={input.api_config?.endpoint_url || ""}
            onChange={(value) =>
              handleChange("api_config", {
                ...input.api_config,
                endpoint_url: value,
              })
            }
            descriptionId="api-url-hint"
          />
          <p id="api-url-hint" className="text-xs text-gray-400 mt-1">
            Placeholders can be used in the path and query string, but not in the domain.
          </p>
          {hasInvalidApiConfig && (
            <ValidationWarning message="An API endpoint URL is required when using API configuration." />
          )}
          {hasPlaceholderInHost && (
            <ValidationWarning message="Placeholders cannot be used in the domain, only in the path or query string." />
          )}
          <PlaceholderReference />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <Select
              label="HTTP Method"
              options={[
                { label: "GET", key: "GET" },
                { label: "POST", key: "POST" },
              ]}
              value={input.api_config?.method || "GET"}
              onChange={(value) => {
                if (value !== "POST") setUseCustomBody(false);
                handleChange("api_config", {
                  ...input.api_config,
                  method: value,
                  body_template: value === "POST" ? input.api_config?.body_template : undefined,
                });
              }}
            />
            <NumberInput
              label="Cache Duration (seconds)"
              value={input.api_config?.cache_duration_seconds || 0}
              min={0}
              max={86400}
              onChange={(value) =>
                handleChange("api_config", {
                  ...input.api_config,
                  cache_duration_seconds: value,
                })
              }
            />
          </div>
          <div className="mt-3">
            <TextInput
              label="No Options Message"
              placeholder="No options available"
              value={input.api_config?.no_options_message || ""}
              onChange={(value) =>
                handleChange("api_config", {
                  ...input.api_config,
                  no_options_message: value || undefined,
                })
              }
              descriptionId="no-options-hint"
            />
            <p id="no-options-hint" className="text-xs text-gray-400 mt-1">
              Shown as a single disabled option in the select menu when the API returns no results.
              Defaults to "No options available" if left blank.
            </p>
          </div>
          {input.api_config?.method === "POST" && (
            <div className="mt-3">
              <div className="flex items-end justify-between gap-3 mb-2">
                <h4 className="text-sm font-medium text-gray-300">Request Body</h4>
                <Slider
                  label="Custom body"
                  labelPosition="left"
                  value={useCustomBody}
                  onChange={(enabled) => {
                    setUseCustomBody(enabled);
                    handleChange("api_config", {
                      ...input.api_config,
                      body_template: enabled
                        ? (input.api_config?.body_template ?? "{}")
                        : undefined,
                    });
                  }}
                />
              </div>
              {useCustomBody ? (
                <>
                  <Textarea
                    value={input.api_config?.body_template ?? ""}
                    max={8192}
                    placeholder={'{\n  "discord_id": "%user_id%",\n  "server": "%guild_id%"\n}'}
                    onChange={(value) =>
                      handleChange("api_config", {
                        ...input.api_config,
                        body_template: value,
                      })
                    }
                  />
                  {bodyTemplateError && <ValidationWarning message={bodyTemplateError} />}
                </>
              ) : (
                <>
                  <pre className="text-xs bg-gray-800 border border-gray-600 rounded p-3 overflow-x-auto">
                    {AUTO_BODY_EXAMPLE}
                  </pre>
                  <p className="text-xs text-gray-400 mt-1">
                    Sent automatically on every request. Turn on "Custom body" to send your own JSON
                    instead.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="mt-3">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Headers</h4>
            {(input.api_config?.headers || []).map((header, index) => (
              <div
                key={index}
                className="flex items-center gap-2 mb-2"
                role="group"
                aria-label={`Header ${index + 1}`}
              >
                <TextInput
                  label="Header Name"
                  value={header.header_name}
                  onChange={(value) => {
                    const newHeaders = [...(input.api_config?.headers || [])];
                    newHeaders[index] = { ...header, header_name: value };
                    handleChange("api_config", {
                      ...input.api_config,
                      headers: newHeaders,
                    });
                  }}
                />
                {header.is_secret &&
                header.header_value === SECRET_HEADER_MASK &&
                !revealedSecrets[index] ? (
                  <div className="flex items-end gap-2 flex-1">
                    <TextInput
                      label="Header Value"
                      value={SECRET_HEADER_MASK}
                      disabled
                      className="flex-1"
                      onChange={() => {}}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRevealedSecrets((prev) => ({ ...prev, [index]: true }));
                        const newHeaders = [...(input.api_config?.headers || [])];
                        newHeaders[index] = { ...header, header_value: "" };
                        handleChange("api_config", {
                          ...input.api_config,
                          headers: newHeaders,
                        });
                      }}
                    >
                      Replace
                    </Button>
                  </div>
                ) : (
                  <TextInput
                    label="Header Value"
                    value={header.header_value}
                    onChange={(value) => {
                      const newHeaders = [...(input.api_config?.headers || [])];
                      newHeaders[index] = { ...header, header_value: value };
                      handleChange("api_config", {
                        ...input.api_config,
                        headers: newHeaders,
                      });
                    }}
                  />
                )}
                <div className="flex items-center gap-1 mt-6">
                  <Slider
                    label="Sensitive"
                    labelPosition="left"
                    value={header.is_secret}
                    onChange={(e) => {
                      const newHeaders = [...(input.api_config?.headers || [])];
                      newHeaders[index] = { ...header, is_secret: e };
                      handleChange("api_config", {
                        ...input.api_config,
                        headers: newHeaders,
                      });
                    }}
                  />
                </div>
                <Button
                  variant="danger"
                  size="icon"
                  aria-label={`Remove header ${index + 1}`}
                  onClick={() => {
                    const newHeaders = (input.api_config?.headers || []).filter(
                      (_, i) => i !== index,
                    );
                    handleChange("api_config", {
                      ...input.api_config,
                      headers: newHeaders,
                    });
                  }}
                  className="mt-6"
                >
                  <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="dashed"
              onClick={() => {
                const newHeader = {
                  header_name: "",
                  header_value: "",
                  is_secret: false,
                };
                const newHeaders = [...(input.api_config?.headers || []), newHeader];
                handleChange("api_config", {
                  ...input.api_config,
                  headers: newHeaders,
                });
              }}
            >
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
              Add Header
            </Button>
          </div>
        </div>
      )}
      {(input.type === 3 || input.type === 21 || input.type === 22) &&
        !(input.type === 3 && isApiSelect) &&
        (() => {
          const maxOpts = input.type === 3 ? 25 : 10;
          const typeLabel =
            input.type === 21
              ? "Radio Group"
              : input.type === 22
                ? "Checkbox Group"
                : "String Select";
          return (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {typeLabel} Options
                {input.options &&
                  input.options.length > 0 &&
                  ` (${input.options.length}/${maxOpts})`}
              </label>
              <div className="space-y-3">
                {input.options?.map((option, optionIndex) => (
                  <div
                    key={option.id || `new-${optionIndex}`}
                    className="bg-gray-600 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-300">
                        Option #{optionIndex + 1}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          title="Move option up"
                          onClick={() => {
                            if (optionIndex > 0 && input.options) {
                              const newOptions = [...input.options];
                              [newOptions[optionIndex - 1], newOptions[optionIndex]] = [
                                newOptions[optionIndex],
                                newOptions[optionIndex - 1],
                              ];
                              newOptions.forEach((opt, idx) => {
                                opt.position = idx + 1;
                              });
                              handleChange("options", newOptions);
                            }
                          }}
                          disabled={optionIndex === 0}
                        >
                          <FontAwesomeIcon icon={faChevronUp} size="sm" />
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          title="Move option down"
                          onClick={() => {
                            if (input.options && optionIndex < input.options.length - 1) {
                              const newOptions = [...input.options];
                              [newOptions[optionIndex + 1], newOptions[optionIndex]] = [
                                newOptions[optionIndex],
                                newOptions[optionIndex + 1],
                              ];
                              newOptions.forEach((opt, idx) => {
                                opt.position = idx + 1;
                              });
                              handleChange("options", newOptions);
                            }
                          }}
                          disabled={!input.options || optionIndex === input.options.length - 1}
                        >
                          <FontAwesomeIcon icon={faChevronDown} size="sm" />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          title="Remove option"
                          onClick={() => {
                            const newOptions =
                              input.options?.filter((_, i) => i !== optionIndex) || [];
                            newOptions.forEach((opt, idx) => {
                              opt.position = idx + 1;
                            });
                            handleChange("options", newOptions);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} size="sm" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <TextInput
                        label="Label *"
                        value={option.label}
                        onChange={(e) => {
                          const newOptions = [...(input.options || [])];
                          newOptions[optionIndex] = { ...option, label: e };
                          handleChange("options", newOptions);
                        }}
                      />
                      <TextInput
                        label="Value *"
                        value={option.value}
                        placeholder="Value"
                        onChange={(e) => {
                          const newOptions = [...(input.options || [])];
                          newOptions[optionIndex] = { ...option, value: e };
                          handleChange("options", newOptions);
                        }}
                      />
                    </div>
                    <div className="mt-2">
                      <TextInput
                        label="Description (optional)"
                        value={option.description}
                        onChange={(e) => {
                          const newOptions = [...(input.options || [])];
                          newOptions[optionIndex] = { ...option, description: e };
                          handleChange("options", newOptions);
                        }}
                      />
                    </div>
                  </div>
                ))}
                {(!input.options || input.options.length === 0) && (
                  <div className="text-gray-400 text-sm text-center py-4">No options added yet</div>
                )}
                {hasNoOptions && (
                  <ValidationWarning
                    message={
                      input.options && input.options.length > maxOpts
                        ? `Too many options. Maximum is ${maxOpts} (currently ${input.options.length}).`
                        : `At least ${minOptionsRequired} option${minOptionsRequired > 1 ? "s are" : " is"} required. Click "Add Option" to create up to ${maxOpts} options.`
                    }
                  />
                )}
                {hasDuplicateValues && (
                  <ValidationWarning
                    message={`Duplicate option values detected: ${duplicateValues.join(", ")}. Each option must have a unique value.`}
                  />
                )}
                {hasBlankOptions && (
                  <ValidationWarning
                    message={`Option ${blankOptions.join(", ")} must have both a label and a value.`}
                  />
                )}
                {!input.options || input.options.length < maxOpts ? (
                  <Button
                    variant="dashed"
                    onClick={() => {
                      const newOption: FormInputOption = {
                        id: Date.now(),
                        form_input_id: input.id,
                        position: (input.options?.length || 0) + 1,
                        label: "",
                        value: "",
                        description: "",
                      };
                      handleChange("options", [...(input.options || []), newOption]);
                    }}
                    className="w-full"
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Add Option
                  </Button>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Maximum of {maxOpts} options reached
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default FormInputRow;
