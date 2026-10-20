import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS,
  SPEAKING_SUBTYPES, SPEAKING_SUBTYPE_LABELS, applySubtype, applyType, hasSpecificContent,
  type ActivityDraft, type ActivityType,
  type SpeakingContent, type SpeakingSubtype, type SpeakingRole,
} from './lesson-schema';

/** Messages keyed by the field path inside the activity, for example `content.text`. */
export type ActivityFieldErrors = Record<string, string>;

type ActivityFormProps = {
  activity: ActivityDraft;
  errors: ActivityFieldErrors;
  onChange: (next: ActivityDraft) => void;
};

const MAX_ROWS = 50;
const MAX_ROW_LENGTH = 2000;

type RowsProps = {
  id: string;
  path: string;
  legend: string;
  itemLabel: string;
  addLabel: string;
  values: string[];
  errors: ActivityFieldErrors;
  onChange: (next: string[]) => void;
  /** Questions and exercises always keep one row; talking points may be dropped to zero. */
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
};

function swap(values: string[], from: number, to: number): string[] {
  const next = [...values];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A list of questions, exercises or points. Rows are added, removed and reordered locally, never saved on the spot. */
function Rows({ id, path, legend, itemLabel, addLabel, values, errors, onChange, minRows = 1, maxRows = MAX_ROWS, maxLength = MAX_ROW_LENGTH }: RowsProps) {
  const listError = errors[path];
  return <div className="activity-rows">
    <p className="activity-rows-legend">{legend}</p>
    {values.map((value, index) => {
      const message = errors[path + '.' + index];
      const errorId = id + '-' + index + '-error';
      return <div className="activity-row" key={index}>
        <label htmlFor={id + '-' + index}>{itemLabel + ' ' + (index + 1)}</label>
        <textarea id={id + '-' + index} rows={2} maxLength={maxLength} value={value}
          aria-invalid={!!message} aria-describedby={message ? errorId : undefined}
          onChange={(event) => onChange(values.map((current, position) => (position === index ? event.target.value : current)))} />
        <small className="error" id={errorId}>{message}</small>
        <span className="activity-row-actions">
          <Button variant="secondary" type="button" icon={ArrowUp} disabled={index === 0}
            aria-label={'Subir ' + itemLabel.toLowerCase() + ' ' + (index + 1)}
            onClick={() => onChange(swap(values, index, index - 1))}>Subir</Button>
          <Button variant="secondary" type="button" icon={ArrowDown} disabled={index === values.length - 1}
            aria-label={'Bajar ' + itemLabel.toLowerCase() + ' ' + (index + 1)}
            onClick={() => onChange(swap(values, index, index + 1))}>Bajar</Button>
          {/* The minimum of rows stays: an activity always needs at least one question or exercise. */}
          <Button variant="secondary" type="button" icon={Trash2} disabled={values.length <= minRows}
            aria-label={'Quitar ' + itemLabel.toLowerCase() + ' ' + (index + 1)}
            onClick={() => onChange(values.filter((_, position) => position !== index))}>Quitar</Button>
        </span>
      </div>;
    })}
    {listError && <small className="error">{listError}</small>}
    <Button variant="secondary" type="button" icon={Plus} disabled={values.length >= maxRows}
      onClick={() => onChange([...values, ''])}>Añadir {addLabel}</Button>
  </div>;
}

type RoleRowsProps = {
  id: string;
  roles: SpeakingRole[];
  errors: ActivityFieldErrors;
  onChange: (next: SpeakingRole[]) => void;
};

const MAX_ROLES = 6;

/** Participants of a roleplay: name and optional description on one compact grid line each, always at least two. */
function RoleRows({ id, roles, errors, onChange }: RoleRowsProps) {
  const listError = errors['content.roles'];
  const patch = (index: number, role: Partial<SpeakingRole>) =>
    onChange(roles.map((current, position) => (position === index ? { ...current, ...role } : current)));
  return <div className="activity-rows">
    <p className="activity-rows-legend">Roles de los participantes</p>
    {roles.map((role, index) => {
      const nameMessage = errors['content.roles.' + index + '.name'];
      const descriptionMessage = errors['content.roles.' + index + '.description'];
      return <div className="activity-role" key={index}>
        <div className="activity-role-field">
          <label htmlFor={id + '-role-' + index + '-name'}>Rol {index + 1} — Nombre</label>
          <input id={id + '-role-' + index + '-name'} maxLength={100} value={role.name}
            aria-invalid={!!nameMessage} aria-describedby={nameMessage ? id + '-role-' + index + '-name-error' : undefined}
            onChange={(event) => patch(index, { name: event.target.value })} />
          <small className="error" id={id + '-role-' + index + '-name-error'}>{nameMessage}</small>
        </div>
        <div className="activity-role-field">
          <label htmlFor={id + '-role-' + index + '-description'}>Rol {index + 1} — Descripción (opcional)</label>
          <input id={id + '-role-' + index + '-description'} maxLength={500} value={role.description}
            aria-invalid={!!descriptionMessage} aria-describedby={descriptionMessage ? id + '-role-' + index + '-description-error' : undefined}
            onChange={(event) => patch(index, { description: event.target.value })} />
          <small className="error" id={id + '-role-' + index + '-description-error'}>{descriptionMessage}</small>
        </div>
        {/* The two minimum roles stay: a roleplay always needs at least two participants. */}
        <Button variant="secondary" type="button" className="activity-role-remove" icon={Trash2} disabled={roles.length <= 2}
          aria-label={'Quitar rol ' + (index + 1)}
          onClick={() => onChange(roles.filter((_, position) => position !== index))} />
      </div>;
    })}
    {listError && <small className="error">{listError}</small>}
    <Button variant="secondary" type="button" icon={Plus} disabled={roles.length >= MAX_ROLES}
      onClick={() => onChange([...roles, { name: '', description: '' }])}>Añadir rol</Button>
  </div>;
}

type TextFieldProps = {
  id: string;
  label: string;
  path: string;
  maxLength: number;
  value: string;
  errors: ActivityFieldErrors;
  onChange: (next: string) => void;
};

/** One single-line optional/required text field wired to its `content.<field>` error path. */
function TextField({ id, label, path, maxLength, value, errors, onChange }: TextFieldProps) {
  const message = errors[path];
  return <div className="activity-field">
    <label htmlFor={id}>{label}</label>
    <input id={id} maxLength={maxLength} value={value}
      aria-invalid={!!message} aria-describedby={message ? id + '-error' : undefined}
      onChange={(event) => onChange(event.target.value)} />
    <small className="error" id={id + '-error'}>{message}</small>
  </div>;
}

type AdvancedSectionProps = {
  id: string;
  /** A stored value already inside the section opens it on mount; a fresh activity starts collapsed. */
  startOpen: boolean;
  /** An error inside opens the section too, so nothing ever blocks the save while hidden. */
  hasError: boolean;
  children: ReactNode;
};

/**
 * Collapsible group for the optional fields. Closing it never discards anything: the values live
 * in the draft, not in the mounted inputs, so hiding and showing the section is purely visual.
 * Opened by saved content or by an error until the teacher toggles it; then their choice rules.
 * The natural anchor for future helpers — a "generate with AI" control will mount inside it.
 */
function AdvancedSection({ id, startOpen, hasError, children }: AdvancedSectionProps) {
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const open = userChoice ?? (startOpen || hasError);
  return <section className="activity-advanced">
    <button type="button" className="activity-advanced-toggle" aria-expanded={open} aria-controls={id + '-body'}
      onClick={() => setUserChoice(!open)}>
      {open ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
      Opciones avanzadas (opcional)
    </button>
    {open && <div className="activity-advanced-body" id={id + '-body'}>{children}</div>}
  </section>;
}

/** The fields of a roleplay: the essentials stay visible; objective, material and script sit in one closed-by-default section. */
function RoleplayFields({ activity, roleplay, errors, onChange }: {
  activity: ActivityDraft & { type: 'Speaking' };
  roleplay: Extract<SpeakingContent, { subtype: 'roleplay' }>;
  errors: ActivityFieldErrors;
  onChange: (next: ActivityDraft) => void;
}) {
  const id = activity.key;
  const patch = (fields: Partial<typeof roleplay>) => onChange({ ...activity, content: { ...roleplay, ...fields } });
  const scriptMessage = errors['content.script'];
  const hasAdvanced = roleplay.objective.trim() !== '' || roleplay.material.trim() !== '' || roleplay.script.trim() !== '';
  return <>
    <TextField id={id + '-context'} label="Situación o contexto" path="content.context" maxLength={2000}
      value={roleplay.context} errors={errors} onChange={(context) => patch({ context })} />
    <RoleRows id={id} roles={roleplay.roles} errors={errors} onChange={(roles) => patch({ roles })} />
    {/* The practice mode has no picker: it derives from the script, guided without one and scripted with it. */}
    <AdvancedSection id={id + '-advanced'} startOpen={hasAdvanced}
      hasError={!!(errors['content.objective'] || errors['content.material'] || scriptMessage)}>
      <TextField id={id + '-objective'} label="Objetivo comunicativo (opcional)" path="content.objective" maxLength={2000}
        value={roleplay.objective} errors={errors} onChange={(objective) => patch({ objective })} />
      <TextField id={id + '-material'} label="Material de apoyo (opcional)" path="content.material" maxLength={5000}
        value={roleplay.material} errors={errors} onChange={(material) => patch({ material })} />
      <div className="activity-field">
        <label htmlFor={id + '-script'}>Guion de conversación (opcional)</label>
        <textarea id={id + '-script'} rows={5} maxLength={10000} value={roleplay.script}
          placeholder={'Waiter: Good evening! Are you ready to order?\nCustomer: Not yet. Could I have a few more minutes, please?'}
          aria-invalid={!!scriptMessage} aria-describedby={scriptMessage ? id + '-script-error' : undefined}
          onChange={(event) => patch({ script: event.target.value, practiceMode: event.target.value.trim() === '' ? 'guided' : 'scripted' })} />
        <small className="error" id={id + '-script-error'}>{scriptMessage}</small>
      </div>
    </AdvancedSection>
  </>;
}

/** The fields of the Speaking subtypes. The subtype decides which ones are rendered. */
function SpeakingFields({ activity, errors, onChange }: { activity: ActivityDraft & { type: 'Speaking' }; errors: ActivityFieldErrors; onChange: (next: ActivityDraft) => void }) {
  const id = activity.key;
  const { content } = activity;
  function changeSubtype(next: SpeakingSubtype): boolean {
    if (next === content.subtype) return true;
    // The warning appears only when there is meaningful content at stake, never over initial blanks.
    if (hasSpecificContent(activity)
      && !window.confirm('Cambiar el tipo de práctica oral descarta el contenido específico incompatible. '
        + 'Se conservan el título, las instrucciones y la duración. ¿Quieres continuar?')) return false;
    onChange(applySubtype(activity, next));
    return true;
  }
  return <>
    <div className="activity-field">
      <label htmlFor={id + '-subtype'}>Tipo de práctica oral</label>
      <select id={id + '-subtype'} value={content.subtype}
        onChange={(event) => {
          // A cancelled confirmation must leave the control showing the subtype that is still in force.
          if (!changeSubtype(event.target.value as SpeakingSubtype)) event.target.value = content.subtype;
        }}>
        {SPEAKING_SUBTYPES.map((subtype) => <option key={subtype} value={subtype}>{SPEAKING_SUBTYPE_LABELS[subtype]}</option>)}
      </select>
    </div>
    {content.subtype === 'conversation' &&
      <Rows id={id + '-question'} path="content.questionsList" legend="Preguntas" itemLabel="Pregunta" addLabel="pregunta"
        values={content.questionsList} errors={errors}
        onChange={(questionsList) => onChange({ ...activity, content: { subtype: 'conversation', questionsList } })} />}
    {content.subtype === 'roleplay' && <RoleplayFields activity={activity} roleplay={content} errors={errors} onChange={onChange} />}
    {content.subtype === 'presentation' && <>
      <TextField id={id + '-context'} label="Tema" path="content.context" maxLength={2000}
        value={content.context} errors={errors}
        onChange={(context) => onChange({ ...activity, content: { ...content, context } })} />
      <Rows id={id + '-point'} path="content.talkingPoints" legend="Puntos de apoyo (opcional)" itemLabel="Punto" addLabel="punto"
        values={content.talkingPoints} errors={errors} minRows={0} maxRows={20} maxLength={500}
        onChange={(talkingPoints) => onChange({ ...activity, content: { ...content, talkingPoints } })} />
    </>}
  </>;
}

/** The fields that depend on the type. `activity` is already narrowed by the discriminant. */
function ContentFields({ activity, errors, onChange }: ActivityFormProps) {
  const id = activity.key;
  if (activity.type === 'Speaking') return <SpeakingFields activity={activity} errors={errors} onChange={onChange} />;
  if (activity.type === 'Reading') {
    const current = activity;
    return <>
      <div className="activity-field">
        <label htmlFor={id + '-text'}>Texto de lectura</label>
        <textarea id={id + '-text'} rows={8} maxLength={20000} value={current.content.text}
          aria-invalid={!!errors['content.text']} aria-describedby={errors['content.text'] ? id + '-text-error' : undefined}
          onChange={(event) => onChange({ ...current, content: { ...current.content, text: event.target.value } })} />
        <small className="error" id={id + '-text-error'}>{errors['content.text']}</small>
      </div>
      <Rows id={id + '-question'} path="content.questionsList" legend="Preguntas" itemLabel="Pregunta" addLabel="pregunta"
        values={current.content.questionsList} errors={errors}
        onChange={(questionsList) => onChange({ ...current, content: { ...current.content, questionsList } })} />
    </>;
  }
  if (activity.type === 'Writing') {
    const current = activity;
    return <div className="activity-field">
      <label htmlFor={id + '-prompt'}>Consigna</label>
      <textarea id={id + '-prompt'} rows={5} maxLength={5000} value={current.content.prompt}
        aria-invalid={!!errors['content.prompt']} aria-describedby={errors['content.prompt'] ? id + '-prompt-error' : undefined}
        onChange={(event) => onChange({ ...current, content: { prompt: event.target.value } })} />
      <small className="error" id={id + '-prompt-error'}>{errors['content.prompt']}</small>
    </div>;
  }
  const current = activity;
  return <>
    <div className="activity-field">
      <label htmlFor={id + '-explanation'}>Explicación</label>
      <textarea id={id + '-explanation'} rows={6} maxLength={10000} value={current.content.explanation}
        aria-invalid={!!errors['content.explanation']} aria-describedby={errors['content.explanation'] ? id + '-explanation-error' : undefined}
        onChange={(event) => onChange({ ...current, content: { ...current.content, explanation: event.target.value } })} />
      <small className="error" id={id + '-explanation-error'}>{errors['content.explanation']}</small>
    </div>
    <Rows id={id + '-exercise'} path="content.exercises" legend="Ejercicios" itemLabel="Ejercicio" addLabel="ejercicio"
      values={current.content.exercises} errors={errors}
      onChange={(exercises) => onChange({ ...current, content: { ...current.content, exercises } })} />
  </>;
}

/**
 * The form of the selected activity. Every type shares title, instructions and duration; the rest of
 * the fields come from the discriminated content. Changing the type asks for confirmation only when
 * there is specific content to discard, and it keeps Id, title, instructions and duration.
 */
export default function ActivityForm({ activity, errors, onChange }: ActivityFormProps) {
  const id = activity.key;
  function changeType(next: ActivityType): boolean {
    if (next === activity.type) return true;
    const discard = hasSpecificContent(activity);
    if (discard && !window.confirm('Cambiar el tipo descarta el contenido específico de esta actividad. '
      + 'Se conservan el título, las instrucciones y la duración. ¿Quieres continuar?')) return false;
    onChange(applyType(activity, next));
    return true;
  }
  return <div className="activity-form">
    <div className="activity-field">
      <label htmlFor={id + '-type'}>Tipo</label>
      <select id={id + '-type'} value={activity.type}
        onChange={(event) => {
          // A cancelled confirmation must leave the control showing the type that is still in force.
          if (!changeType(event.target.value as ActivityType)) event.target.value = activity.type;
        }}>
        {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{ACTIVITY_TYPE_LABELS[type]}</option>)}
      </select>
    </div>
    <div className="activity-field">
      <label htmlFor={id + '-title'}>Título de la actividad</label>
      <input id={id + '-title'} maxLength={200} value={activity.title}
        aria-invalid={!!errors.title} aria-describedby={errors.title ? id + '-title-error' : undefined}
        onChange={(event) => onChange({ ...activity, title: event.target.value })} />
      <small className="error" id={id + '-title-error'}>{errors.title}</small>
    </div>
    <div className="activity-field">
      <label htmlFor={id + '-instructions'}>Instrucciones</label>
      <textarea id={id + '-instructions'} rows={3} maxLength={2000} value={activity.instructions}
        aria-invalid={!!errors.instructions} aria-describedby={errors.instructions ? id + '-instructions-error' : undefined}
        onChange={(event) => onChange({ ...activity, instructions: event.target.value })} />
      <small className="error" id={id + '-instructions-error'}>{errors.instructions}</small>
    </div>
    <div className="activity-field">
      <label htmlFor={id + '-duration'}>Duración (minutos)</label>
      <input id={id + '-duration'} type="number" inputMode="numeric" min={1} step={1}
        value={activity.duration === null ? '' : String(activity.duration)}
        aria-invalid={!!errors.duration} aria-describedby={errors.duration ? id + '-duration-error' : undefined}
        onChange={(event) => onChange({ ...activity, duration: event.target.value === '' ? null : Number(event.target.value) })} />
      <small className="error" id={id + '-duration-error'}>{errors.duration}</small>
    </div>
    <ContentFields activity={activity} errors={errors} onChange={onChange} />
  </div>;
}
