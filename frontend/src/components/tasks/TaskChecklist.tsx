"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, TextInput, useToast } from "@/components/ds";
import { getProject, updateProject, getTask, updateChecklistItem, updateTask } from "@/lib/api/projects";
import type { ProjectRead, TaskRead } from "@/lib/types";
import styles from "./TaskChecklist.module.css";

export type ChecklistDraft = { id?: string | null; text: string; is_done?: boolean };

function AddItem({ disabled, onAdd, saving = false }: { disabled?: boolean; saving?: boolean; onAdd: (text: string) => void }) {
  const { t: translateUI } = useI18n();

  const [text, setText] = useState("");
  function add() {
    if (disabled || !text.trim()) return;
    onAdd(text.trim());
    if (!saving) { setText(""); }
  }
  return <div className={styles.add}>
    <TextInput value={text} disabled={disabled} maxLength={500} aria-label={translateUI("New checklist item")} placeholder={translateUI("Add a checklist item…")} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
    <Button type="button" variant="secondary" size="sm" disabled={disabled || !text.trim()} onClick={add}><Plus size={15} aria-hidden /><LocalizedText message={"Add item"} /></Button>
  </div>;
}

export function ChecklistEditor({ items, onChange, disabled, entity = "task" }: { items: ChecklistDraft[]; onChange: (items: ChecklistDraft[]) => void; disabled?: boolean; entity?: "task" | "project" }) {
  const { t: translateUI } = useI18n();

  return <div className={styles.editor}>
    {items.length === 0 && <p className={styles.hint}><LocalizedText message={entity === "task" ? "Break the task into small, actionable steps." : "Break the project into small, actionable steps."} /></p>}
    {items.map((item, index) => <div className={styles.row} key={item.id ?? index}>
      <span className={styles.marker} aria-label={item.is_done ? translateUI("Completed") : undefined}>{item.is_done ? <Check size={16} /> : `${index + 1}.`}</span>
      <TextInput value={item.text} disabled={disabled} maxLength={500} aria-label={translateUI("Checklist item {number}", { number: index + 1 })} onChange={(event) => onChange(items.map((current, i) => i === index ? { ...current, text: event.target.value } : current))} />
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={translateUI("Remove checklist item {number}", { number: index + 1 })} title={translateUI("Remove item")} onClick={() => onChange(items.filter((_, i) => i !== index))}><X size={16} aria-hidden /></Button>
    </div>)}
    <AddItem disabled={disabled} onAdd={(text) => onChange([...items, { id: null, text }])} />
    <span className={styles.hint}><LocalizedText message={entity === "task" ? "Press Enter to add an item. Changes are saved with the task." : "Press Enter to add an item. Changes are saved with the project."} /></span>
  </div>;
}

type Action = { type: "add"; text: string } | { type: "edit"; id: string; text: string } | { type: "remove"; id: string } | { type: "toggle"; id: string; done: boolean };
export function TaskChecklist({ task, canEdit }: { task: TaskRead; canEdit: boolean }) {
  return <EntityChecklist entity={task} canEdit={canEdit} kind="task" />;
}
export function ProjectChecklist({ project, canEdit }: { project: ProjectRead; canEdit: boolean }) {
  return <EntityChecklist entity={{ id: project.id, checklist_items: project.checklist_items ?? [] }} canEdit={canEdit} kind="project" />;
}
function EntityChecklist({ entity: task, canEdit, kind }: { entity: Pick<TaskRead, "id" | "checklist_items">; canEdit: boolean; kind: "task" | "project" }) {
  const { t: translateUI } = useI18n();

  const qc = useQueryClient();
  const toast = useToast();
  const lock = useRef(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (kind === "task" && action.type === "toggle") return updateChecklistItem(task.id, action.id, action.done);
      if (kind === "project") {
        const latest = await getProject(task.id);
        let items: { id?: string; text: string; is_done: boolean; order: number }[] = latest.checklist_items ?? [];
        if (action.type === "add") items = [...items, { text: action.text, is_done: false, order: items.length }];
        if (action.type === "edit") items = items.map((item) => item.id === action.id ? { ...item, text: action.text } : item);
        if (action.type === "toggle") items = items.map((item) => item.id === action.id ? { ...item, is_done: action.done } : item);
        if (action.type === "remove") items = items.filter((item) => item.id !== action.id);
        return updateProject(task.id, { checklist_items: items.map((item, order) => ({ ...item, order })) });
      }
      const latest = await getTask(task.id);
      let items: ChecklistDraft[] = latest.checklist_items.map((item) => ({ id: item.id, text: item.text }));
      if (action.type === "add") items.push({ id: null, text: action.text });
      if (action.type === "edit") items = items.map((item) => item.id === action.id ? { ...item, text: action.text } : item);
      if (action.type === "remove") items = items.filter((item) => item.id !== action.id);
      return updateTask(task.id, { checklist_items: items.map((item, order) => ({ id: item.id, text: item.text, order })) });
    },
    onSuccess: (saved, action) => {
      if (kind === "task") qc.setQueryData(["task", task.id], saved);
      else {
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      }
      for (const key of ["tasks", "phase-tasks", "phase-progress", "project-overview"]) qc.invalidateQueries({ queryKey: [key] });
      if (action.type === "add") setText("");
      if (action.type === "edit") setEditing(null);
      if (action.type === "remove") setRemoving(null);
    },
    onError: () => toast.push("Could not save the checklist. Your changes are still here; please try again.", "error"),
    onSettled: () => { lock.current = false; },
    retry: false,
  });
  function submit(action: Action) {
    if (!canEdit || lock.current) return;
    lock.current = true;
    mutation.mutate(action);
  }
  const completed = task.checklist_items.filter((item) => item.is_done).length;
  const total = task.checklist_items.length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  const disabled = mutation.isPending;
  return <section className="task-content-card" aria-label={translateUI(kind === "task" ? "Task checklist" : "Project checklist")}>
    <div className="card-top-bar"><div className={styles.heading}><ListChecks size={16} aria-hidden /><span className="card-title"><LocalizedText message={"Checklist"} /></span></div><span className={styles.hint} aria-live="polite">{total ? translateUI("{completed} of {total} completed", { completed, total }) : <LocalizedText message={"No items yet"} />}</span></div>
    <div className={styles.content}>
      {total > 0 && <div className={styles.progress} role="progressbar" aria-label={translateUI("Checklist completion")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{ width: `${percent}%` }} /></div>}
      {!total && <p className={styles.hint}><LocalizedText message={kind === "task" ? "Break this task into small steps and track each one here." : "Break this project into small steps and track each one here."} /></p>}
      {task.checklist_items.map((item) => <div key={item.id} className={styles.item}>
        <div className={styles.row}>
          <input type="checkbox" className={styles.checkbox} checked={item.is_done} disabled={!canEdit || disabled} aria-label={translateUI("Complete {item}", { item: item.text })} onChange={(event) => submit({ type: "toggle", id: item.id, done: event.target.checked })} />
          {editing === item.id ? <>
            <TextInput autoFocus value={draft} maxLength={500} aria-label={translateUI("Edit checklist item")} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (draft.trim()) submit({ type: "edit", id: item.id, text: draft.trim() }); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(null); } }} />
            <Button type="button" variant="secondary" size="sm" disabled={disabled || !draft.trim()} aria-label={translateUI("Save checklist item")} onClick={() => submit({ type: "edit", id: item.id, text: draft.trim() })}><Check size={16} aria-hidden /></Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={translateUI("Cancel editing checklist item")} onClick={() => setEditing(null)}><X size={16} aria-hidden /></Button>
          </> : <>
            <span className={item.is_done ? styles.done : styles.text}>{item.text}</span>
            {canEdit && <div className={styles.actions}>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={translateUI("Edit checklist item {item}", { item: item.text })} title={translateUI("Edit item")} onClick={() => { setEditing(item.id); setDraft(item.text); setRemoving(null); }}><Pencil size={14} aria-hidden /></Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={translateUI("Remove checklist item {item}", { item: item.text })} title={translateUI("Remove item")} onClick={() => { setRemoving(item.id); setEditing(null); }}><Trash2 size={14} aria-hidden /></Button>
            </div>}
          </>}
        </div>
        {removing === item.id && <div className={styles.confirm}><span><LocalizedText message={"Remove this item?"} /></span><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setRemoving(null)}><LocalizedText message={"Cancel"} /></Button><Button type="button" variant="danger" size="sm" disabled={disabled} onClick={() => submit({ type: "remove", id: item.id })}><LocalizedText message={"Remove item"} /></Button></div>}
      </div>)}
      {canEdit && <div className={styles.add}>
        <TextInput value={text} maxLength={500} disabled={disabled} aria-label={translateUI("New checklist item")} placeholder={translateUI("Add a checklist item…")} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (text.trim()) submit({ type: "add", text: text.trim() }); } }} />
        <Button type="button" variant="secondary" size="sm" disabled={disabled || !text.trim()} onClick={() => submit({ type: "add", text: text.trim() })}><Plus size={15} aria-hidden />{disabled && mutation.variables?.type === "add" ? <LocalizedText message={"Adding…"} /> : <LocalizedText message={"Add item"} />}</Button>
      </div>}
      <span className={styles.hint}>{disabled ? <LocalizedText message={"Saving…"} /> : total && kind === "task" ? <LocalizedText message={"Checking all items automatically marks the task as Done."} /> : canEdit ? <LocalizedText message={"Press Enter to add. Each change saves automatically."} /> : ""}</span>
    </div>
  </section>;
}