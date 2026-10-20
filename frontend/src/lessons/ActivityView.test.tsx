import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import ActivityView, { type ActivityViewProps } from './ActivityView';
import type { LessonActivityDto } from './lesson-api';
import type { ActivityType } from './lesson-schema';

function activity(type: ActivityType, content: unknown): LessonActivityDto {
  return {
    id: 'a1', type, title: 'Una actividad', instructions: 'Instrucciones de la actividad',
    content, order: 0, estimatedDuration: 10,
  };
}

/** The class names frozen by the contract (C3). ActivityView may consume them, never invent new ones. */
const CONTRACT_CLASSES = [
  'player-activity', 'player-activity-instructions', 'player-activity-text',
  'player-activity-prompt', 'player-activity-explanation', 'player-activity-list',
];

/** The body blocks, in the order they are rendered, so the reading order is asserted, not assumed. */
function bodyClasses(container: HTMLElement): string[] {
  const root = container.querySelector('section.player-activity');
  if (!root) throw new Error('ActivityView must render a section.player-activity root.');
  return Array.from(root.children).map((child) => child.className);
}

/** The questions or exercises, proving they are one numbered block and not sub-navigation. */
function listItems(): (string | null)[] {
  const list = screen.getByRole('list');
  expect(list.tagName).toBe('OL');
  return within(list).getAllByRole('listitem').map((item) => item.textContent);
}

it('shows the instructions and the numbered questions of a Speaking activity', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    questionsList: ['¿Cómo te llamas?', '¿De dónde eres?'],
  })} />);
  expect(screen.getByTestId('player-instructions')).toHaveTextContent('Instrucciones de la actividad');
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-list']);
  expect(listItems()).toEqual(['¿Cómo te llamas?', '¿De dónde eres?']);
});

it('shows the situation, roles, objective and script of a roleplay', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    subtype: 'roleplay', context: 'Cena en un restaurante',
    roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: null }],
    objective: 'Pedir la cuenta', material: 'Tarjetas de apoyo',
    script: 'Waiter: Good evening!\nCustomer: Not yet.', practiceMode: 'scripted', questionsList: null,
  })} />);
  // Every block reuses a contract class: texts as paragraphs and roles as one numbered list.
  const root = container.querySelector('section.player-activity')!;
  expect(Array.from(root.children).map((child) => child.className)).toEqual([
    'player-activity-instructions', 'player-activity-text', 'player-activity-list',
    'player-activity-text', 'player-activity-text', 'player-activity-text',
  ]);
  expect(screen.getByText('Situación:')).toBeInTheDocument();
  expect(screen.getByText('Cena en un restaurante')).toBeInTheDocument();
  expect(listItems()).toEqual(['Waiter — Toma el pedido', 'Customer']);
  expect(screen.getByText('Objetivo:')).toBeInTheDocument();
  expect(screen.getByText('Pedir la cuenta')).toBeInTheDocument();
  expect(screen.getByText('Material de apoyo:')).toBeInTheDocument();
  // The continuous script keeps its line breaks as real breaks: one paragraph, two interventions.
  const script = screen.getByText(/Good evening!/);
  expect(script.className).toBe('player-activity-text');
  expect(script.querySelectorAll('br')).toHaveLength(1);
  expect(script.textContent).toBe('Waiter: Good evening!Customer: Not yet.');
});

it('omits the optional roleplay blocks that are blank', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    subtype: 'roleplay', context: 'Una fiesta',
    roles: [{ name: 'Ana', description: '' }], objective: null, material: null, script: null, practiceMode: 'free',
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-text', 'player-activity-list']);
  expect(screen.queryByText('Objetivo:')).not.toBeInTheDocument();
  expect(screen.queryByText('Material de apoyo:')).not.toBeInTheDocument();
  expect(listItems()).toEqual(['Ana']);
});

it('shows the theme and the talking points of a presentation', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    subtype: 'presentation', context: 'Mi ciudad favorita', talkingPoints: ['Lugares', 'Comida'], questionsList: null,
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-text', 'player-activity-list']);
  expect(screen.getByText('Tema:')).toBeInTheDocument();
  expect(screen.getByText('Mi ciudad favorita')).toBeInTheDocument();
  expect(listItems()).toEqual(['Lugares', 'Comida']);
});

it('shows a presentation without points as only its theme', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    subtype: 'presentation', context: 'Mis vacaciones', talkingPoints: [],
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-text']);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('reads a speaking row without subtype as conversation', () => {
  const { container } = render(<ActivityView activity={activity('Speaking', {
    questionsList: ['¿Qué tal?'], roles: [{ name: 'Ajeno', description: null }], script: 'Diálogo ajeno',
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-list']);
  expect(listItems()).toEqual(['¿Qué tal?']);
  expect(screen.queryByText(/Diálogo ajeno/)).not.toBeInTheDocument();
});

it('shows the instructions, the reading text and the questions of a Reading activity', () => {
  const { container } = render(<ActivityView activity={activity('Reading', {
    text: 'Un texto de lectura.', questionsList: ['Primera pregunta'],
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-text', 'player-activity-list']);
  expect(screen.getByText('Un texto de lectura.')).toBeInTheDocument();
  expect(listItems()).toEqual(['Primera pregunta']);
});

it('shows the instructions and the prompt of a Writing activity, with no list', () => {
  const { container } = render(<ActivityView activity={activity('Writing', {
    prompt: 'Escribe un correo formal.',
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-prompt']);
  expect(screen.getByText('Escribe un correo formal.')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('shows the instructions, the explanation and the numbered exercises of a VocabularyGrammar activity', () => {
  const { container } = render(<ActivityView activity={activity('VocabularyGrammar', {
    explanation: 'El presente simple.', exercises: ['Completa: I ___ (work) here.', 'Corrige: She go.'],
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-explanation', 'player-activity-list']);
  expect(screen.getByText('El presente simple.')).toBeInTheDocument();
  expect(listItems()).toEqual(['Completa: I ___ (work) here.', 'Corrige: She go.']);
});

it('renders only the fields of its own type when the content carries others', () => {
  const { container } = render(<ActivityView activity={activity('Reading', {
    text: 'Texto de lectura', prompt: 'Consigna ajena', explanation: 'Explicación ajena',
    exercises: ['Ejercicio ajeno'], questionsList: ['Pregunta propia'],
  })} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions', 'player-activity-text', 'player-activity-list']);
  expect(listItems()).toEqual(['Pregunta propia']);
  expect(screen.queryByText('Consigna ajena')).not.toBeInTheDocument();
  expect(screen.queryByText('Explicación ajena')).not.toBeInTheDocument();
  expect(screen.queryByText('Ejercicio ajeno')).not.toBeInTheDocument();
});

it('shows HTML as literal text and never builds elements from it', () => {
  const reading = '<b>negrita</b> y <script>alert("hola")</script>';
  const question = '<img src=x onerror="alert(1)">';
  const { container } = render(<ActivityView activity={activity('Reading', {
    text: reading, questionsList: [question],
  })} />);
  expect(screen.getByText(reading)).toBeInTheDocument();
  expect(screen.getByText(question)).toBeInTheDocument();
  // Nothing in the payload became an element: the tags are text, not markup.
  expect(container.querySelector('b')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
});

it('shows only the instructions when the content is missing or does not match the type', () => {
  const { container } = render(<ActivityView activity={activity('Writing', null)} />);
  expect(bodyClasses(container)).toEqual(['player-activity-instructions']);
  expect(screen.getByTestId('player-instructions')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('drops list entries that are not text instead of inventing content', () => {
  render(<ActivityView activity={activity('Speaking', {
    questionsList: ['Válida', 7, null, '   ', { question: 'objeto' }, 'Otra'],
  })} />);
  expect(listItems()).toEqual(['Válida', 'Otra']);
});

it('uses only the class names frozen by the contract and invents none', () => {
  const { container } = render(<ActivityView activity={activity('VocabularyGrammar', {
    explanation: 'Explicación', exercises: ['Uno', 'Dos'],
  })} />);
  const used = Array.from(container.querySelectorAll<HTMLElement>('*')).flatMap((element) => Array.from(element.classList));
  expect(used.length).toBeGreaterThan(0);
  expect(used.filter((name) => !CONTRACT_CLASSES.includes(name))).toEqual([]);
});

it('keeps the frozen props contract: one activity and nothing else', () => {
  const props: ActivityViewProps = { activity: activity('Writing', { prompt: 'Consigna' }) };
  render(<ActivityView {...props} />);
  expect(screen.getByTestId('player-instructions')).toBeInTheDocument();
});
