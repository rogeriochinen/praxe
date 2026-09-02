import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { ProductApp } from "@/components/product-app";
import { PraxeLogo } from "@/components/praxe-logo";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user) {
    return <main className="login-shell min-h-svh px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] max-w-[1160px] flex-col border border-[#D7D6CF] bg-[#FAFAF7] sm:min-h-[calc(100svh-3rem)]">
        <header className="flex items-center justify-between border-b border-[#D7D6CF] px-5 py-4 sm:px-8">
          <PraxeLogo />
          <a className="text-sm font-bold text-[#1B3BD6] hover:text-[#1531AE]" href={chatGPTSignInPath("/")} target="_top">Entrar no workspace</a>
        </header>

        <div className="grid flex-1 lg:grid-cols-[1.08fr_.92fr]">
          <section className="flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-14">
            <span className="mb-6 w-fit border border-[#C6CFF6] bg-[#E7EAFB] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[.12em] text-[#1B3BD6]">O jeito da casa</span>
            <h1 className="max-w-2xl text-balance font-display text-5xl font-semibold leading-[.98] tracking-[-.045em] text-[#1C1C1A] sm:text-6xl">Sua empresa, menos dependente de você.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#57574F]">Transformamos o conhecimento que está na cabeça do dono em processos claros — escritos, auditáveis e mantidos em dia por quem executa.</p>
            <a href={chatGPTSignInPath("/")} target="_top" className="mt-9 inline-flex min-h-11 w-fit items-center gap-2 bg-[#1B3BD6] px-5 text-sm font-bold text-white transition hover:bg-[#1531AE]">Mapear minha operação <ArrowRight className="size-4" /></a>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#57574F]"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#147A4E]" />Decisão sempre humana</span><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#147A4E]" />Histórico preservado</span></div>
          </section>

          <section className="hidden border-l border-[#3F3F3A] bg-[#1C1C1A] p-10 lg:flex lg:items-center">
            <div className="w-full">
              <p className="mb-8 font-mono text-[11px] font-medium uppercase tracking-[.14em] text-[#8FA6FF]">O conhecimento encontra seu lugar</p>
              {[
                ["01", "O dono conta", "Entrevista e áudios curtos capturam contexto real."],
                ["02", "O assistente organiza", "Processos, riscos e decisões ganham estrutura."],
                ["03", "A equipe mantém vivo", "Quem executa sugere. Quem responde decide."],
              ].map(([n, title, body]) => <article key={n} className="grid grid-cols-[42px_1fr] gap-4 border-t border-[#3F3F3A] py-5 last:border-b">
                <span className="font-mono text-[11px] text-[#8FA6FF]">{n}</span>
                <div><h2 className="font-display text-[17px] font-semibold text-[#FAFAF7]">{title}</h2><p className="mt-1 text-sm leading-6 text-[#B9B8B0]">{body}</p></div>
              </article>)}
              <p className="mt-8 border-l-[3px] border-[#1B3BD6] bg-[#292927] px-4 py-3 text-sm text-[#D7D6CF]">O jeito da casa, escrito e em dia.</p>
            </div>
          </section>
        </div>
      </div>
    </main>;
  }

  return <ProductApp user={{ name: user.displayName, email: user.email, localDevelopment: user.localDevelopment }} />;
}
