import { useAuth } from '../auth';
import StudentsPage from './StudentsPage';

/** The trash is the same listing in its `trash` state, exactly like the lesson one. */
export default function StudentsTrashPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <StudentsPage user={user} trash />;
}
