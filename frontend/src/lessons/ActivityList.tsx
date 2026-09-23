import { ACTIVITY_TYPE_LABELS, type ActivityDraft } from './lesson-schema';

type ActivityListProps = {
  activities: readonly ActivityDraft[];
  selectedKey: string | null;
  /** First message per activity, keyed by the draft's local key, so an error is visible even when
   *  the activity is not the selected one. */
  errors: Record<string, string>;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  /** Moves one activity one position up (-1) or down (1). It never writes to the server. */
  onMove: (key: string, direction: -1 | 1) => void;
};

/**
 * The ordered list of the draft. It is fully controlled: it never holds a copy of the activities, so
 * switching the selection cannot lose the local values of the others. Removing or reordering only
 * changes the local draft; the server learns about it when the teacher saves.
 *
 * Order is changed with plain buttons, which keeps the flow reachable by keyboard and avoids adding
 * a drag-and-drop dependency.
 */
export default function ActivityList({ activities, selectedKey, errors, onSelect, onRemove, onMove }: ActivityListProps) {
  if (activities.length === 0) {
    return <p className="activity-empty">
      Esta clase todavía no tiene actividades. Puedes guardarla así y agregarlas más tarde.
    </p>;
  }
  return <ol className="activity-list">
    {activities.map((activity, index) => {
      const error = errors[activity.key];
      const name = activity.title.trim() || 'Actividad sin título';
      const errorId = 'activity-error-' + activity.key;
      return <li key={activity.key} className={error ? 'activity-item has-error' : 'activity-item'}>
        <div className="activity-item-main">
          <button type="button" className="activity-select" aria-pressed={activity.key === selectedKey}
            aria-describedby={error ? errorId : undefined} onClick={() => onSelect(activity.key)}>
            <span className="activity-position" aria-hidden="true">{index + 1}</span>
            <span className="activity-name">{name}</span>
            <span className="activity-type">{ACTIVITY_TYPE_LABELS[activity.type]}</span>
            <span className="activity-duration">{activity.duration === null ? 'Sin duración' : activity.duration + ' min'}</span>
          </button>
          <div className="activity-order">
            <button type="button" className="secondary" disabled={index === 0}
              aria-label={'Subir ' + name} onClick={() => onMove(activity.key, -1)}>Subir</button>
            <button type="button" className="secondary" disabled={index === activities.length - 1}
              aria-label={'Bajar ' + name} onClick={() => onMove(activity.key, 1)}>Bajar</button>
          </div>
          <button type="button" className="secondary activity-remove" aria-label={'Quitar ' + name}
            onClick={() => onRemove(activity.key)}>Quitar</button>
        </div>
        {error && <p className="error activity-error" id={errorId}>{error}</p>}
      </li>;
    })}
  </ol>;
}
