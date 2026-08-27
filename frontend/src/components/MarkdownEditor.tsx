import { useId, useEffect, useCallback, type FC } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBold,
  faItalic,
  faStrikethrough,
  faCode,
  faHeading,
  faListUl,
  faListOl,
  faQuoteRight,
  faLink,
  faMinus,
} from "@fortawesome/free-solid-svg-icons";
import type { Editor } from "@tiptap/react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  maxLength?: number;
  label?: string;
  className?: string;
}

interface MarkdownStorage {
  markdown: {
    getMarkdown: () => string;
  };
}

function getMarkdown(storage: unknown): string {
  return (storage as MarkdownStorage).markdown.getMarkdown();
}

interface ToolbarButtonProps {
  icon: IconDefinition;
  label: string;
  isActive: boolean;
  onClick: () => void;
  textLabel?: string;
}

const ToolbarButton: FC<ToolbarButtonProps> = ({ icon, label, isActive, onClick, textLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={isActive}
    className={`p-1.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-600"
    }`}
    title={label}
  >
    {textLabel ? (
      <span className="font-mono text-xs font-bold px-0.5">{textLabel}</span>
    ) : (
      <FontAwesomeIcon icon={icon} className="w-3.5 h-3.5" aria-hidden="true" />
    )}
  </button>
);

const ToolbarDivider: FC = () => <div className="w-px h-5 bg-gray-600 mx-0.5" aria-hidden="true" />;

const EditorToolbar: FC<{ editor: Editor }> = ({ editor }) => {
  const handleLink = useCallback(() => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 bg-gray-800 border border-neutral-600 border-b-0 rounded-t px-2 py-1.5"
      role="toolbar"
      aria-label="Text formatting"
    >
      {/* Inline formatting */}
      <ToolbarButton
        icon={faBold}
        label="Bold"
        isActive={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={faItalic}
        label="Italic"
        isActive={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={faStrikethrough}
        label="Strikethrough"
        isActive={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        icon={faCode}
        label="Inline code"
        isActive={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        icon={faHeading}
        label="Heading 1"
        isActive={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        textLabel="H1"
      />
      <ToolbarButton
        icon={faHeading}
        label="Heading 2"
        isActive={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        textLabel="H2"
      />
      <ToolbarButton
        icon={faHeading}
        label="Heading 3"
        isActive={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        textLabel="H3"
      />

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        icon={faListUl}
        label="Bullet list"
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={faListOl}
        label="Ordered list"
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <ToolbarDivider />

      {/* Block formatting */}
      <ToolbarButton
        icon={faQuoteRight}
        label="Blockquote"
        isActive={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={faCode}
        label="Code block"
        isActive={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        textLabel="</>"
      />
      <ToolbarButton
        icon={faLink}
        label="Link"
        isActive={editor.isActive("link")}
        onClick={handleLink}
      />
      <ToolbarButton
        icon={faMinus}
        label="Horizontal rule"
        isActive={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
    </div>
  );
};

const MarkdownEditor: FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = "",
  maxLength,
  label,
  className = "",
}) => {
  const editorId = useId();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-400 underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Markdown,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const md = getMarkdown(editor.storage);
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: "prose-editor min-h-50 max-h-125 overflow-y-auto p-3 text-white focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label || "Content editor",
      },
    },
  });

  // Sync external value changes (e.g. when loading saved data)
  useEffect(() => {
    if (!editor) return;
    const currentMd = getMarkdown(editor.storage);
    if (value !== currentMd) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const markdownLength = editor ? getMarkdown(editor.storage).length : value.length;

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={editorId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div id={editorId}>
        {editor && <EditorToolbar editor={editor} />}
        <div className="bg-gray-700 border border-neutral-600 border-t-0 rounded-b focus-within:ring-2 focus-within:ring-blue-500">
          <EditorContent editor={editor} />
        </div>
      </div>
      {maxLength !== undefined && (
        <span className="text-xs mt-0.5">
          {markdownLength}/{maxLength}
        </span>
      )}
    </div>
  );
};

export default MarkdownEditor;
