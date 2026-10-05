import { EDITOR_STEPS, STEP_LABELS, stepNumber, type EditorStep } from './editor-steps';

type StepIndicatorProps = {
  current: EditorStep;
  /** Steps before the current one are clickable, so the teacher can jump back without losing data. */
  onGoTo: (step: EditorStep) => void;
};

/**
 * Shows where the teacher is inside the wizard. The current step is the only one marked with
 * `aria-current="step"`, and only steps already visited are buttons: a step that is still ahead is
 * rendered as plain text, because advancing requires completing the current one.
 */
export default function StepIndicator({ current, onGoTo }: StepIndicatorProps) {
  const currentIndex = EDITOR_STEPS.indexOf(current);
  return <nav className="editor-steps" aria-label="Pasos del editor">
    <p className="editor-steps-count">Paso {stepNumber(current)} de {EDITOR_STEPS.length}</p>
    <ol className="editor-steps-list">
      {EDITOR_STEPS.map((step, index) => {
        const isCurrent = step === current;
        const isDone = index < currentIndex;
        const className = 'editor-step' + (isCurrent ? ' is-current' : '') + (isDone ? ' is-done' : '');
        return <li key={step} className={className} aria-current={isCurrent ? 'step' : undefined}>
          <span className="editor-step-number" aria-hidden="true">{index + 1}</span>
          {isDone
            ? <button type="button" className="editor-step-link" onClick={() => onGoTo(step)}>{STEP_LABELS[step]}</button>
            : <span className="editor-step-label">{STEP_LABELS[step]}</span>}
        </li>;
      })}
    </ol>
  </nav>;
}
