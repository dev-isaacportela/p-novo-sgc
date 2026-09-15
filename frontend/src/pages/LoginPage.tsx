import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loginWithGoogleMitra,
  loginWithMicrosoftMitra,
  emailLoginMitra,
  emailSignupMitra,
  emailVerifyCodeMitra,
  emailResendCodeMitra,
  sendPasswordResetCodeMitra,
  validatePasswordResetCodeMitra,
  resetPasswordMitra,
} from 'mitra-interactions-sdk';
import type { LoginResponse } from 'mitra-interactions-sdk';
import { saveSession, SIMULADOR_URL } from '@/lib/mitra-auth';
import { MonogramTile, Wordmark } from '@/components/Logo';
import { Alert, Button, Card, Input, LabelledField, TextLink } from '@/components/page';

const AUTH_URL = import.meta.env.VITE_MITRA_AUTH_URL;
const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const loginOpts = { authUrl: AUTH_URL, projectId: PROJECT_ID, create: true };

// Sem VITE_MITRA_AUTH_URL o app está em desenvolvimento local: quem autentica é
// o simulador (backend/simulator/README.md). A tela é a MESMA nos dois casos
// (design.md §10.1): os passos que só a conta Mitra real cumpre continuam
// navegáveis e recusam no envio, dizendo o que fazer no lugar. Uma segunda tela
// só para o simulador escondia metade do acesso de quem trabalha local — e tela
// que não abre em desenvolvimento não é revisada.
const LOCAL = !AUTH_URL;
// Porta do simulador deste projeto: vem de mitra-auth (VITE_MITRA_BASE_URL ou 3109).
const SO_COM_CONTA_MITRA =
  'Este passo precisa da conta Mitra real. No ambiente local, entre com e-mail e senha (mitra123).';

type View = 'main' | 'verify' | 'forgot-email' | 'forgot-code' | 'forgot-newpassword';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();

  // State
  const [view, setView] = useState<View>('main');
  const [isCreate, setIsCreate] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handleSuccess(response: LoginResponse) {
    saveSession(response as unknown as Record<string, unknown>);
    onLogin();
    navigate('/', { replace: true });
  }

  /** Recusa de um passo que só a conta Mitra cumpre. Devolve true se recusou. */
  function recusaLocal() {
    if (!LOCAL) return false;
    setSuccess('');
    setError(SO_COM_CONTA_MITRA);
    return true;
  }

  // ── SSO (popup) ──

  async function handleSso(provider: 'google' | 'microsoft') {
    if (recusaLocal()) return;
    setLoading(provider);
    setError('');
    try {
      const fn = provider === 'google' ? loginWithGoogleMitra : loginWithMicrosoftMitra;
      const response = await fn(loginOpts);
      handleSuccess(response);
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Falha no login. Tente novamente.');
    } finally {
      setLoading(null);
    }
  }

  // ── Simulador local ──

  async function entrarNoSimulador() {
    setLoading('email');
    setError('');
    try {
      const resposta = await fetch(`${SIMULADOR_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.token) {
        setError(corpo?.error?.message || 'Usuário ou senha inválidos no simulador.');
        return;
      }
      saveSession({ baseURL: corpo.baseURL || SIMULADOR_URL, token: `Bearer ${corpo.token}` });
      onLogin();
      navigate('/', { replace: true });
    } catch {
      setError('Simulador fora do ar. Rode: cd backend && npm run sim');
    } finally {
      setLoading(null);
    }
  }

  // ── Email login (silent iframe) ──

  async function handleEmailSubmit() {
    if (isCreate && !name.trim()) { setError('Preencha o nome'); return; }
    if (!email.trim()) { setError('Preencha o email'); return; }

    if (LOCAL) {
      // Criar conta é da conta Mitra; entrar com e-mail é o que o simulador faz.
      if (isCreate) { recusaLocal(); return; }
      await entrarNoSimulador();
      return;
    }

    if (!password.trim()) { setError('Preencha a senha'); return; }

    setLoading('email');
    setError('');

    try {
      if (isCreate) {
        await emailSignupMitra({ ...loginOpts, name: name.trim(), email: email.trim(), password: password.trim() });
        // Signup ok → precisa verificar código
        setView('verify');
      } else {
        const response = await emailLoginMitra({ ...loginOpts, email: email.trim(), password: password.trim() });
        handleSuccess(response);
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Erro na autenticação');
    } finally {
      setLoading(null);
    }
  }

  // ── Verificação de código ──

  /**
   * Filtra para dígitos no onChange, sem `maxLength` (design.md §10.1): o
   * atributo conta o que está no DOM, sujeira inclusa, e ao chegar em seis
   * caracteres passaria a engolir dígitos bons. Reescreve `e.target.value`
   * porque quando o filtro devolve o mesmo estado o React não re-renderiza, e
   * a letra digitada ficaria visível no campo.
   */
  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = digitos;
    setCode(digitos);
  }

  async function handleVerifyCode() {
    if (recusaLocal()) return;
    if (code.length < 6) { setError('Digite o código de 6 dígitos'); return; }

    setLoading('verify');
    setError('');

    try {
      const response = await emailVerifyCodeMitra({
        ...loginOpts,
        email: email.trim(),
        code,
        password: password.trim(),
      });
      handleSuccess(response);
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Código inválido ou expirado');
    } finally {
      setLoading(null);
    }
  }

  async function handleResendCode() {
    if (recusaLocal()) return;
    setLoading('resend');
    setError('');
    try {
      await emailResendCodeMitra({ ...loginOpts, email: email.trim() });
      setError(''); // limpa erro anterior
    } catch {
      // silencioso
    } finally {
      setLoading(null);
    }
  }

  // ── Esqueci minha senha ──

  function goToForgot() {
    setView('forgot-email');
    setError('');
    setSuccess('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
  }

  function backToLogin() {
    setView('main');
    setError('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleSendResetCode() {
    if (!email.trim()) { setError('Preencha o email'); return; }
    if (recusaLocal()) return;

    setLoading('forgot-send');
    setError('');

    try {
      await sendPasswordResetCodeMitra({ authUrl: AUTH_URL, email: email.trim() });
      setCode('');
      setView('forgot-code');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Não foi possível enviar o código');
    } finally {
      setLoading(null);
    }
  }

  async function handleValidateResetCode() {
    if (recusaLocal()) return;
    if (code.length < 6) { setError('Digite o código de 6 dígitos'); return; }

    setLoading('forgot-validate');
    setError('');

    try {
      await validatePasswordResetCodeMitra({ authUrl: AUTH_URL, email: email.trim(), code });
      setView('forgot-newpassword');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Código inválido ou expirado');
    } finally {
      setLoading(null);
    }
  }

  async function handleResetPassword() {
    if (!newPassword.trim()) { setError('Preencha a nova senha'); return; }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem'); return; }
    if (recusaLocal()) return;

    setLoading('forgot-reset');
    setError('');

    try {
      await resetPasswordMitra({
        authUrl: AUTH_URL,
        email: email.trim(),
        code,
        newPassword: newPassword.trim(),
      });
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCode('');
      setView('main');
      setSuccess('Senha redefinida! Entre com a nova senha.');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Não foi possível redefinir a senha');
    } finally {
      setLoading(null);
    }
  }

  /**
   * Cada passo é um <form> de verdade (design.md §10.1): é o que dá Enter para
   * enviar e o que o gerenciador de senhas lê.
   */
  function envia(acao: () => void) {
    return (e: React.FormEvent) => {
      e.preventDefault();
      acao();
    };
  }

  // ── Render ──

  const busy = loading !== null;

  const heading =
    view === 'verify' || view === 'forgot-code'
      ? 'Verifique seu email'
      : view === 'forgot-email'
        ? 'Recuperar senha'
        : view === 'forgot-newpassword'
          ? 'Nova senha'
          : isCreate
            ? 'Criar conta'
            : 'Entrar';

  const subheading =
    view === 'verify' || view === 'forgot-code'
      ? `Enviamos um código para ${email}`
      : view === 'forgot-email'
        ? 'Digite seu email para receber um código'
        : view === 'forgot-newpassword'
          ? 'Escolha uma nova senha para sua conta'
          : isCreate
            ? 'Preencha os dados para criar sua conta'
            : LOCAL
              ? 'Ambiente local: entre com e-mail e senha (mitra123).'
              : 'Escolha como deseja acessar';

  return (
    <div className="min-h-screen bg-ground">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_minmax(0,27rem)] lg:gap-20 lg:px-8">
        {/* ── Metade esquerda: assinatura e slogan ── */}
        <div className="hidden flex-col gap-7 lg:flex">
          <Wordmark className="h-9" />

          <h2 className="font-title text-4xl leading-[1.12] font-bold tracking-tight text-balance text-ink sm:text-5xl">
            Distribuindo saúde e{' '}
            <span className="text-primary">promovendo o bem-estar</span>
          </h2>

          <div className="max-w-md rounded-3xl bg-brand-50 p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Acesse com a conta corporativa para montar pedidos, aprovar compras e
              acompanhar o envio à indústria.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="h-px w-10 bg-brand-300" aria-hidden />
              <span className="text-[11px] font-semibold tracking-[0.16em] text-ink-secondary uppercase">
                Gestão de compras
              </span>
            </div>
          </div>
        </div>

        {/* ── Metade direita: o cartão de acesso ── */}
        <div className="mx-auto flex w-full max-w-md flex-col">
          {/* No mobile a coluna da esquerda não existe: a marca e o slogan sobem
              para cá, acima do cartão. */}
          <div className="mb-7 flex flex-col items-center gap-3 lg:hidden">
            <Wordmark className="h-7" />
            <p className="text-center text-[13px] leading-relaxed text-ink-secondary">
              Distribuindo saúde e promovendo o bem-estar
            </p>
          </div>

          <Card className="w-full p-8">
            <div className="mb-6 flex flex-col gap-3">
              <MonogramTile />
              <div>
                <h1 className="font-title text-2xl font-bold text-ink">{heading}</h1>
                <p className="mt-1 text-[13px] text-ink-secondary">{subheading}</p>
              </div>
            </div>

            {view === 'verify' ? (
              /* ── Verificação de código ── */
              <form className="flex flex-col gap-4" onSubmit={envia(handleVerifyCode)}>
                <LabelledField label="Código de verificação">
                  <Input
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={handleCodeChange}
                    className="h-12 text-center text-2xl font-bold tracking-[0.5em]"
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {loading === 'verify' ? 'Verificando...' : 'Verificar'}
                </Button>

                <TextLink className="self-center" onClick={handleResendCode} disabled={busy}>
                  {loading === 'resend' ? 'Enviando...' : 'Reenviar código'}
                </TextLink>
              </form>
            ) : view === 'forgot-email' ? (
              /* ── Esqueci minha senha: pedir email ── */
              <form className="flex flex-col gap-4" onSubmit={envia(handleSendResetCode)}>
                <LabelledField label="Email">
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {loading === 'forgot-send' ? 'Enviando...' : 'Enviar código'}
                </Button>

                <TextLink className="self-center" onClick={backToLogin} disabled={busy}>
                  Voltar para login
                </TextLink>
              </form>
            ) : view === 'forgot-code' ? (
              /* ── Esqueci minha senha: validar código ── */
              <form className="flex flex-col gap-4" onSubmit={envia(handleValidateResetCode)}>
                <LabelledField label="Código de verificação">
                  <Input
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={handleCodeChange}
                    className="h-12 text-center text-2xl font-bold tracking-[0.5em]"
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {loading === 'forgot-validate' ? 'Validando...' : 'Validar código'}
                </Button>

                <div className="flex items-center justify-center gap-4">
                  <TextLink onClick={handleSendResetCode} disabled={busy}>
                    {loading === 'forgot-send' ? 'Enviando...' : 'Reenviar código'}
                  </TextLink>
                  <TextLink onClick={backToLogin} disabled={busy}>
                    Voltar para login
                  </TextLink>
                </div>
              </form>
            ) : view === 'forgot-newpassword' ? (
              /* ── Esqueci minha senha: nova senha ── */
              <form className="flex flex-col gap-4" onSubmit={envia(handleResetPassword)}>
                <LabelledField label="Nova senha">
                  <Input
                    type="password"
                    placeholder="Sua nova senha"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={busy}
                    autoFocus
                  />
                </LabelledField>

                <LabelledField label="Confirmar senha">
                  <Input
                    type="password"
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={busy}
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {loading === 'forgot-reset' ? 'Salvando...' : 'Redefinir senha'}
                </Button>

                <TextLink className="self-center" onClick={backToLogin} disabled={busy}>
                  Voltar para login
                </TextLink>
              </form>
            ) : (
              /* ── Tela principal: SSO + Email ── */
              <form className="flex flex-col gap-3" onSubmit={envia(handleEmailSubmit)}>
                <Button className="w-full" onClick={() => handleSso('google')} disabled={busy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {loading === 'google' ? 'Aguarde...' : 'Continue com Google'}
                </Button>

                <Button className="w-full" onClick={() => handleSso('microsoft')} disabled={busy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                  </svg>
                  {loading === 'microsoft' ? 'Aguarde...' : 'Continue com Microsoft'}
                </Button>

                <div className="my-2 flex items-center gap-3">
                  <span className="h-px flex-1 bg-rule-row" />
                  <span className="text-[12px] whitespace-nowrap text-ink-secondary">
                    {isCreate ? 'Ou crie com e-mail' : 'Ou entre com e-mail'}
                  </span>
                  <span className="h-px flex-1 bg-rule-row" />
                </div>

                {isCreate && (
                  <LabelledField label="Nome">
                    <Input
                      placeholder="Seu nome completo"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                    />
                  </LabelledField>
                )}

                <LabelledField label="Email">
                  <Input
                    type="email"
                    placeholder={LOCAL ? 'ana@sgc.local' : 'seu@email.com'}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </LabelledField>

                <LabelledField label="Senha">
                  <Input
                    type="password"
                    placeholder={LOCAL ? 'mitra123' : 'Sua senha'}
                    autoComplete={isCreate ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {loading === 'email'
                    ? (isCreate ? 'Cadastrando...' : 'Entrando...')
                    : (isCreate ? 'Cadastrar' : 'Entrar')}
                </Button>

                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  {!isCreate ? (
                    <TextLink onClick={goToForgot} disabled={busy}>
                      Esqueci minha senha
                    </TextLink>
                  ) : (
                    <span />
                  )}
                  <TextLink
                    onClick={() => { setIsCreate(!isCreate); setError(''); setSuccess(''); }}
                    disabled={busy}
                  >
                    {isCreate ? 'Já tem conta? Entre aqui' : 'Criar conta'}
                  </TextLink>
                </div>
              </form>
            )}

            {/* Aviso no fluxo da tela, onde a ação aconteceu — não some sozinho. */}
            {error && (
              <div className="mt-4">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            {success && !error && (
              <div className="mt-4">
                <Alert tone="success">{success}</Alert>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
