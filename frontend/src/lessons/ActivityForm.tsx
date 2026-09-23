import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, applyType, hasSpecificContent,
  type ActivityDraft, type ActivityType,
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
};

/** A list of questions or exercises. Rows are added and removed locally, never saved on the spot. */
function Rows({ id, path, legend, itemLabel, addLabel, values, errors, onChange }: RowsProps) {
  const listError = errors[path];
  return <div className="activity-rows">
    <p className="activity-rows-legend">{legend}</p>
    {values.map((value, index) => {
      const message = errors[path + '.' + index];
      const errorId = id + '-' + index + '-error';
      return <div className="activity-row" key={index}>
        <label htmlFor={id + '-' + index}>{itemLabel + ' ' + (index + 1)}</label>
        <textarea id={id + '-' + index} rows={2} maxLength={MAX_ROW_LENGTH} value={value}
          aria-invalid={!!message} aria-describedby={message ? errorId : undefined}
          onChange={(event) => onChange(values.map((current, position) => (position === index ? event.target.value : current)))} />
        <small className="error" id={errorId}>{message}</small>
        {/* The last remaining row stays: an activity always needs at least one question or exercise. */}
        <button type="button" className="secondary" disabled={values.length === 1}
          aria-label={'Quitar ' + itemLabel.toLowerCase() + ' ' + (index + 1)}
          onClick={() => onChange(values.filter((_, position) => position !== index))}>Quitar</button>
      </div>;
    })}
    {listError && <small className="error">{listError}</small>}
    <button type="button" className="secondary" disabled={values.length >= MAX_ROWS}
      onClick={() => onChange([...values, ''])}>Añadir {addLabel}</button>
  </div>;
}

/** The fields that depend on the type. `activity` is already narrowed by the discriminant. */
function ContentFields({ activity, errors, onChange }: ActivityFormProps) {
  const id = activity.key;
  if (activity.type === 'Speaking') {
    const current = activity;
    return <Rows id={id + '-question'} path="content.questionsList" legend="Preguntas" itemLabel="Pregunta" addLabel="pregunta"
      values={current.content.questionsList} errors={errors}
      onChange={(questionsList) => onChange({ ...current, content: { questionsList } })} />;
  }
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
    <h3>Actividad seleccionada</h3>
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
