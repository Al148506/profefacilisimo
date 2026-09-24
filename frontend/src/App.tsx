import LessonEditorPage from './lessons/LessonEditorPage';
import LessonPlayerPage from './lessons/LessonPlayerPage';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { initializeAuth, login, register, retryInitialization, useAuth } from './auth';
import LessonsPage from './lessons/LessonsPage';
import { loginSchema, registerSchema, type Credentials } from './validation';

function ProtectedRoute() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function AuthPage({ registering = false }: { registering?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const form = useForm<Credentials>({ resolver: zodResolver(registering ? registerSchema : loginSchema) });
  const mutation = useMutation({
    mutationFn: async (values: Credentials) => {
      if (registering) await register(values.email, values.password);
      else await login(values.email, values.password);
    },
    onSuccess: () => { if (!registering) navigate('/', { replace: true }); },
  });
  if (user) return <Navigate to="/" replace />;
  if (registering && mutation.isSuccess) return <section className="card">
    <p className="eyebrow">Todo empieza aquí</p><h1>Tu cuenta está lista</h1>
    <p>Ya puedes entrar a tu espacio de preparación de clases.</p>
    <Link className="button" to="/login">Iniciar sesión</Link>
  </section>;
  return <section className="card">
    <p className="eyebrow">Tu espacio como profe</p>
    <h1>{registering ? 'Crea tu cuenta' : 'Qué bueno verte de nuevo'}</h1>
    <p>{registering ? 'Prepara el camino para tus próximas clases de español.' : 'Entra a tu espacio de trabajo.'}</p>
    <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
      <label htmlFor="email">Correo electrónico</label>
      <input id="email" type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!form.formState.errors.email} aria-describedby="email-error" />
      <small id="email-error" className="error">{form.formState.errors.email?.message}</small>
      <label htmlFor="password">Contraseña</label>
      <input id="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} {...form.register('password')} aria-invalid={!!form.formState.errors.password} aria-describedby="password-help password-error" />
      <small id="password-help">{registering ? '12 a 128 caracteres, con mayúscula, minúscula y número.' : 'Usa la contraseña de tu cuenta.'}</small>
      <small id="password-error" className="error">{form.formState.errors.password?.message}</small>
      {mutation.isError && <p role="alert" className="error">{mutation.error instanceof TypeError ? 'No pudimos conectar con el servidor.' : mutation.error.message}</p>}
      <button disabled={mutation.isPending}>{mutation.isPending ? 'Un momento…' : registering ? 'Crear cuenta' : 'Iniciar sesión'}</button>
    </form>
    <p className="footnote">{registering ? '¿Ya tienes cuenta? ' : '¿Primera vez por aquí? '}
      <Link to={registering ? '/login' : '/register'}>{registering ? 'Inicia sesión' : 'Crea una cuenta'}</Link>
    </p>
  </section>;
}

function Dashboard({ trash = false }: { trash?: boolean }) {
  const { user } = useAuth();
  return user ? <LessonsPage key={user.id + (trash ? '-trash' : '-active')} user={user} trash={trash} /> : null;
}

export default function App() {
  const { loading, error } = useAuth();
  useEffect(() => { void initializeAuth(); }, []);
  return <><header><Link to="/" className="brand"><span aria-hidden="true">pf.</span> Profe Facilísimo</Link><span className="header-note">Menos preparación. Más conversación.</span></header>
    <main>{loading ? <p role="status">Preparando tu espacio…</p> : error ? <section className="card"><h1>No hay conexión</h1><p role="alert">{error}</p><button onClick={() => void retryInitialization()}>Reintentar</button></section> : <Routes>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" registering />} />
      <Route element={<ProtectedRoute />}><Route path="/" element={<Dashboard />} /><Route path="/lessons/trash" element={<Dashboard trash />} /><Route path="/lessons/new" element={<LessonEditorPage />} /><Route path="/lessons/:id/edit" element={<LessonEditorPage />} /><Route path="/lessons/:id/play" element={<LessonPlayerPage />} /></Route>
      <Route path="*" element={<section className="card"><h1>Página no encontrada</h1><Link to="/">Volver al inicio</Link></section>} />
    </Routes>}</main><footer>Un espacio para enseñar español, a tu manera.</footer></>;
}
