from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "apresentacoes"
OUT_FILE = OUT_DIR / "Central_do_Colaborador_passo_a_passo_LGPD_tecnico.pptx"
LOGO = ROOT / "frontend" / "public" / "rh-logo.jpg"
MASCOT = ROOT / "frontend" / "public" / "mascote-ia.png"

BLUE = RGBColor(0, 90, 140)
DARK = RGBColor(0, 59, 104)
ORANGE = RGBColor(232, 117, 34)
GREEN = RGBColor(32, 140, 105)
RED = RGBColor(185, 28, 28)
TEXT = RGBColor(31, 41, 55)
MUTED = RGBColor(100, 116, 139)
LIGHT = RGBColor(241, 245, 249)
WHITE = RGBColor(255, 255, 255)


def safe_image(path):
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except Exception:
        return False


def text(slide, value, x, y, w, h, size=18, bold=False, color=TEXT, align=None):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    frame.margin_left = Inches(0.04)
    frame.margin_right = Inches(0.04)
    p = frame.paragraphs[0]
    p.text = value
    if align:
        p.alignment = align
    p.font.name = "Aptos"
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = color
    return box


def box(slide, x, y, w, h, fill=WHITE, line=RGBColor(226, 232, 240)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(1)
    return shape


def header(slide, title, subtitle, section):
    text(slide, section.upper(), 0.65, 0.22, 3.0, 0.24, size=8.5, bold=True, color=ORANGE)
    text(slide, title, 0.65, 0.46, 8.5, 0.42, size=25, bold=True, color=DARK)
    text(slide, subtitle, 0.67, 0.95, 8.2, 0.28, size=10.5, color=MUTED)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.65), Inches(1.25), Inches(8.7), Inches(0.03))
    line.fill.solid()
    line.fill.fore_color.rgb = ORANGE
    line.line.fill.background()


def footer(slide, n):
    text(slide, f"Central do Colaborador | {n:02}", 8.2, 7.05, 1.35, 0.2, size=7.5, color=MUTED, align=PP_ALIGN.RIGHT)


def bullets(slide, items, x, y, w, h, size=14, color=TEXT):
    box_shape = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box_shape.text_frame
    frame.clear()
    frame.margin_left = Inches(0.04)
    for index, item in enumerate(items):
        p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        p.text = item
        p.level = 0
        p.font.name = "Aptos"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(8)
    return box_shape


def step_card(slide, number, title, body, x, y, color=BLUE):
    box(slide, x, y, 2.75, 1.05, fill=WHITE)
    circ = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.18), Inches(y + 0.22), Inches(0.48), Inches(0.48))
    circ.fill.solid()
    circ.fill.fore_color.rgb = color
    circ.line.fill.background()
    text(slide, str(number), x + 0.19, y + 0.32, 0.46, 0.14, size=10, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    text(slide, title, x + 0.78, y + 0.17, 1.75, 0.26, size=12.5, bold=True, color=DARK)
    text(slide, body, x + 0.78, y + 0.5, 1.75, 0.28, size=8.9, color=MUTED)


def feature_card(slide, title, body, x, y, w, color=BLUE):
    box(slide, x, y, w, 1.05, fill=LIGHT)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(0.08), Inches(1.05))
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    text(slide, title, x + 0.22, y + 0.16, w - 0.44, 0.24, size=12.5, bold=True, color=DARK)
    text(slide, body, x + 0.22, y + 0.48, w - 0.44, 0.32, size=9.2, color=MUTED)


def pill(slide, value, x, y, w, color=BLUE):
    shape = box(slide, x, y, w, 0.34, fill=color, line=color)
    frame = shape.text_frame
    frame.margin_left = Inches(0.05)
    frame.margin_right = Inches(0.05)
    p = frame.paragraphs[0]
    p.text = value
    p.alignment = PP_ALIGN.CENTER
    p.font.name = "Aptos"
    p.font.size = Pt(9.5)
    p.font.bold = True
    p.font.color.rgb = WHITE


def slide_use(prs, n, title, subtitle, intro, steps, features=None, mascot=False):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    header(slide, title, subtitle, "Passo a passo de uso")
    text(slide, intro, 0.82, 1.58, 8.25, 0.52, size=15, bold=True, color=DARK)
    for i, (step_title, step_body) in enumerate(steps, start=1):
        step_card(slide, i, step_title, step_body, 0.85 + ((i - 1) % 3) * 3.02, 2.35 + ((i - 1) // 3) * 1.25, [BLUE, ORANGE, GREEN][(i - 1) % 3])
    if features:
        for i, (feature_title, feature_body) in enumerate(features):
            feature_card(slide, feature_title, feature_body, 0.85 + i * 3.05, 5.7, 2.75, DARK if i % 2 else ORANGE)
    if mascot and safe_image(MASCOT):
        slide.shapes.add_picture(str(MASCOT), Inches(7.78), Inches(5.35), height=Inches(1.35))
    footer(slide, n)
    return slide


def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # 1
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = DARK
    if safe_image(LOGO):
        slide.shapes.add_picture(str(LOGO), Inches(0.7), Inches(0.55), height=Inches(0.64))
    if safe_image(MASCOT):
        slide.shapes.add_picture(str(MASCOT), Inches(6.95), Inches(1.1), height=Inches(4.3))
    text(slide, "Central do Colaborador", 0.75, 1.7, 5.8, 0.58, size=32, bold=True, color=WHITE)
    text(slide, "Passo a passo de uso, segurança/LGPD e visão técnica", 0.76, 2.38, 5.8, 0.36, size=17, color=RGBColor(226, 232, 240))
    bullets(slide, [
        "Como acessar e navegar pela plataforma",
        "Como usar cada módulo disponível para colaboradores e motoristas",
        "Como o administrador mantém dados, conteúdos e módulos atualizados",
        "Como a plataforma protege dados pessoais e apoia a conformidade com a LGPD",
    ], 0.9, 3.25, 5.55, 1.7, size=14.5, color=WHITE)
    pill(slide, "Plataforma em operação na empresa", 0.9, 5.75, 2.65, ORANGE)

    # 2-10: usage
    slide_use(prs, 2, "Acesso à Plataforma", "Entrada autenticada para cada colaborador.", "O acesso começa pela matrícula e senha, com troca obrigatória no primeiro uso.", [
        ("Entrar no link", "Abrir a URL da Central no navegador."),
        ("Informar matrícula", "Usar a matrícula cadastrada na base."),
        ("Senha inicial", "Quando aplicável, usar a senha temporária fornecida."),
        ("Trocar senha", "No primeiro acesso, criar uma senha pessoal."),
        ("Acessar a central", "Após a troca, o sistema libera os módulos."),
        ("Sair com segurança", "Usar o botão Sair ao finalizar o uso."),
    ], [("Perfis", "Admin, motorista e colaborador têm permissões diferentes."), ("Proteção", "Rotas internas exigem login válido."), ("Autonomia", "Reset de senha pode ser feito pelo admin.")])

    slide_use(prs, 3, "Tela Inicial e Navegação", "A central mostra os módulos disponíveis para cada perfil.", "Na tela inicial, o colaborador escolhe o card desejado e vê avisos ou módulos em manutenção.", [
        ("Ver saudação", "A página identifica o usuário logado."),
        ("Escolher card", "Cada card abre uma funcionalidade."),
        ("Observar avisos", "Módulos em manutenção mostram uma mensagem."),
        ("Acessar carrossel", "Ações e eventos aparecem na área pública interna."),
        ("Usar Yuri", "O assistente fica disponível no canto da tela."),
        ("Voltar ao início", "A navegação retorna para a Central do Colaborador."),
    ], [("Personalização", "Cards aparecem conforme perfil e liberação administrativa."), ("Sonho da Unidade", "Painel reforça pilares da operação."), ("Usabilidade", "Fluxo simples para uso recorrente.")], mascot=True)

    slide_use(prs, 4, "Pesquisa de Clima", "Participação em pesquisas internas.", "O módulo de Pesquisa de Clima permite responder formulários ativos e acompanhar a comunicação do RH.", [
        ("Abrir o card", "Selecionar Pesquisa de Clima na tela inicial."),
        ("Ler a pesquisa", "Ver título, contexto e perguntas disponíveis."),
        ("Responder", "Preencher as respostas solicitadas."),
        ("Enviar", "Registrar a participação na plataforma."),
        ("Acompanhar status", "Ver se há novas pesquisas ativas."),
        ("Admin analisa", "Administradores acessam resultados e gestão da pesquisa."),
    ], [("Engajamento", "Facilita participação dos colaboradores."), ("Organização", "Centraliza pesquisas em um único local."), ("Gestão", "Admin cria e acompanha pesquisas.")])

    slide_use(prs, 5, "SKAP e 3 Rs", "Desenvolvimento, reconhecimento e acompanhamento.", "Esses módulos ajudam o colaborador a entender evolução, habilidades avaliadas e conceitos internos.", [
        ("Abrir SKAP", "Consultar nível atual e avaliação vinculada ao colaborador."),
        ("Ver evolução", "Acompanhar histórico e habilidades registradas."),
        ("Entender nível", "Visualizar classificação como acompanhamento individual."),
        ("Abrir 3 Rs", "Consultar responsabilidades, recursos e reconhecimentos."),
        ("Usar como guia", "Aplicar as orientações no dia a dia."),
        ("Falar com RH", "Em dúvidas ou contestação, procurar conferência oficial."),
    ], [("Dados próprios", "Cada pessoa consulta apenas informações autorizadas."), ("Base atualizável", "SKAP pode ser importado por planilhas."), ("Clareza", "Transforma avaliação em orientação prática.")])

    slide_use(prs, 6, "Segurança Operacional e Rota", "Módulos para motoristas, ajudantes e operação.", "A plataforma apoia rotinas de segurança com reconhecimento, indicadores e orientações antes da operação.", [
        ("Campeão de Segurança", "Reconhecer atitudes seguras e acompanhar destaques."),
        ("Indicadores da Rota", "Ver metas e indicadores operacionais."),
        ("Rotograma Seguro", "Consultar rotas, pontos de risco e orientações."),
        ("Ler orientações", "Conferir recomendações antes da execução."),
        ("Acompanhar campanhas", "Ver publicações e ações de segurança."),
        ("Acionar liderança", "Levar dúvidas operacionais para o responsável."),
    ], [("Prevenção", "Informação de risco fica acessível antes da rota."), ("Reconhecimento", "Boas práticas ganham visibilidade."), ("Perfil correto", "Indicadores de rota são liberados por perfil.")])

    slide_use(prs, 7, "Produtividade e Prontuário", "Consulta de indicadores individuais e operacionais.", "Os módulos permitem acompanhar premiação, metas, pontuação e faixa do prontuário quando disponível.", [
        ("Abrir Produtividade", "Consultar indicadores, metas batidas e valor previsto."),
        ("Ver detalhes", "Entender composição e período apresentado."),
        ("Abrir Prontuário", "Consultar pontuação, faixa e ocorrências."),
        ("Interpretar faixa", "Usar a classificação como orientação de acompanhamento."),
        ("Conferir dúvidas", "Em divergência, procurar RH para validação."),
        ("Aguardar atualização", "Dados dependem da última importação/publicação."),
    ], [("Transparência", "Colaborador entende melhor seus indicadores."), ("Governança", "Contestação segue fluxo humano de conferência."), ("Histórico", "Importações podem preservar rastreabilidade.")])

    slide_use(prs, 8, "Yuri, Assistente de RH", "Atendimento rápido dentro da própria central.", "O Yuri responde dúvidas frequentes usando a base oficial do RH e IA quando habilitada.", [
        ("Abrir o chat", "Clicar no botão Yuri na tela."),
        ("Usar sugestões", "Selecionar perguntas rápidas cadastradas."),
        ("Digitar dúvida", "Enviar a pergunta em linguagem natural."),
        ("Receber resposta", "O sistema usa base oficial, IA ou fallback."),
        ("Respeitar limites", "Dados sensíveis e contestação são direcionados ao RH."),
        ("Registrar atendimento", "Interações podem ser salvas para gestão."),
    ], [("Base oficial", "Perguntas e respostas são geridas pelo admin."), ("IA controlada", "A chave fica somente no backend."), ("Tom acolhedor", "Respostas simples, curtas e profissionais.")], mascot=True)

    slide_use(prs, 9, "Admin: Dados e Importações", "Como manter a plataforma atualizada.", "A Central do Administrador concentra planilhas, dados publicados e manutenção cadastral.", [
        ("Entrar como admin", "Acessar a Central do Administrador."),
        ("Baixar modelo", "Usar modelos Excel disponíveis no painel."),
        ("Preencher planilha", "Atualizar colaboradores, prontuário ou base do Yuri."),
        ("Importar arquivo", "Enviar Excel/CSV pelo painel."),
        ("Validar retorno", "Conferir registros importados e erros."),
        ("Resetar senha", "Quando necessário, retornar senha temporária ao colaborador."),
    ], [("Menos dependência técnica", "O admin atualiza dados pelo painel."), ("Validação", "Importações retornam status e erros."), ("Logs", "Processos de importação geram registros.")])

    slide_use(prs, 10, "Admin: Conteúdo, Módulos e Acessos", "Como operar a comunicação e governança da central.", "O administrador também publica conteúdos, configura módulos e acompanha métricas de uso.", [
        ("Publicar ações", "Cadastrar CIPA, Café com o Gerente e Comitê de Gente."),
        ("Subir imagens", "Adicionar banners e descrições para o carrossel."),
        ("Gerir Yuri", "Criar, editar, ativar ou excluir respostas oficiais."),
        ("Configurar módulos", "Ativar, ocultar, ordenar ou colocar em manutenção."),
        ("Ver acessos", "Acompanhar total, acessos do dia e histórico."),
        ("Salvar alterações", "Mudanças refletem na Central do Colaborador."),
    ], [("Controle", "Admin decide o que aparece por perfil."), ("Comunicação", "Ações internas ganham visibilidade."), ("Operação", "Manutenção não exige novo deploy.")])

    # 11-15: LGPD/security
    lgpd_slides = [
        ("Segurança e LGPD: Visão Geral", "A plataforma foi desenhada para tratar dados pessoais com finalidade clara e acesso controlado.", [
            "Finalidade: dados usados para RH, comunicação, indicadores e autosserviço.",
            "Necessidade: cada perfil acessa somente o que precisa para sua função.",
            "Transparência: informações são apresentadas ao próprio colaborador na central.",
            "Segurança: autenticação, autorização e variáveis sensíveis no backend.",
            "Responsabilização: logs e rotinas administrativas ajudam a demonstrar controle.",
        ]),
        ("Controle de Acesso e Perfis", "A principal barreira de proteção é limitar quem vê e quem administra cada informação.", [
            "Login por matrícula e senha com token JWT.",
            "Primeiro acesso obriga troca da senha temporária.",
            "Rotas administrativas exigem perfil admin.",
            "Colaborador/motorista acessa dados próprios, não dados de terceiros.",
            "Módulos podem ser liberados, ocultados ou colocados em manutenção por perfil.",
        ]),
        ("Minimização e Privacidade no Yuri", "O assistente usa contexto limitado e não deve expor dados sensíveis desnecessários.", [
            "A IA prioriza respostas oficiais cadastradas pelo RH.",
            "CPF, telefone e e-mail não são enviados como conteúdo necessário para resposta.",
            "Temas como contestação, salário, prontuário ou dados pessoais são encaminhados ao RH.",
            "A chave da IA fica no backend, fora do navegador do usuário.",
            "Fallback local reduz dependência externa quando a IA está desativada ou indisponível.",
        ]),
        ("Rastreabilidade e Operação Segura", "A plataforma mantém trilhas operacionais úteis para auditoria interna.", [
            "Importações geram logs e relatórios de erro.",
            "Atendimentos do Yuri podem ser registrados com categoria e status.",
            "Contador de acessos fica restrito ao administrador.",
            "Atualizações de planilhas preservam vínculos por matrícula quando aplicável.",
            "Backups e logs existentes ajudam na conferência de dados publicados.",
        ]),
        ("Boas Práticas Recomendadas", "A tecnologia ajuda, mas a conformidade depende também de processo e governança.", [
            "Manter responsáveis definidos para base de dados, respostas do Yuri e importações.",
            "Revisar periodicamente usuários admin e colaboradores desligados/inativos.",
            "Usar senhas fortes e não compartilhar contas.",
            "Validar bases antes de importar e corrigir dados inconsistentes.",
            "Documentar rotinas, finalidade, retenção e resposta a incidentes conforme orientação da ANPD.",
        ]),
    ]
    for offset, (title, subtitle, items) in enumerate(lgpd_slides, start=11):
        slide = prs.slides.add_slide(blank)
        header(slide, title, subtitle, "Segurança e LGPD")
        bullets(slide, items, 0.95, 1.75, 5.85, 3.25, size=14.2)
        box(slide, 7.05, 1.8, 2.0, 3.1, fill=LIGHT)
        text(slide, "Ponto-chave", 7.35, 2.15, 1.4, 0.28, size=15, bold=True, color=DARK, align=PP_ALIGN.CENTER)
        key = [
            "Acesso mínimo necessário",
            "Dados próprios por colaborador",
            "IA com limites explícitos",
            "Logs para gestão",
            "Processo + tecnologia",
        ][offset - 11]
        text(slide, key, 7.35, 2.85, 1.4, 0.75, size=15, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)
        text(slide, "Referência conceitual: princípios da LGPD e guias orientativos da ANPD.", 1.0, 6.25, 7.8, 0.32, size=9.5, color=MUTED, align=PP_ALIGN.CENTER)
        footer(slide, offset)

    # 16
    slide = prs.slides.add_slide(blank)
    header(slide, "Visão Técnica: Arquitetura", "Stack simples para manutenção, evolução e deploy.", "Parte técnica")
    feature_card(slide, "Frontend", "React + Vite, rotas protegidas, telas de colaborador, motorista e admin.", 0.8, 1.75, 2.5, BLUE)
    feature_card(slide, "Backend", "Node.js + Express, APIs REST, autenticação JWT, CORS e regras de perfil.", 3.75, 1.75, 2.5, ORANGE)
    feature_card(slide, "Dados", "SQLite em desenvolvimento e PostgreSQL/Supabase em produção.", 6.7, 1.75, 2.5, GREEN)
    feature_card(slide, "Importações", "Scripts e rotas para Excel/CSV: colaboradores, SKAP, prontuário, RV, rotogramas e base Yuri.", 0.8, 3.25, 2.5, DARK)
    feature_card(slide, "IA", "OpenAI Responses API opcional, com fallback para base oficial cadastrada.", 3.75, 3.25, 2.5, BLUE)
    feature_card(slide, "Deploy", "Backend serve o frontend compilado; ambiente previsto com Render + Supabase.", 6.7, 3.25, 2.5, ORANGE)
    text(slide, "Fluxo técnico: usuário autenticado -> frontend React -> API Express -> banco de dados/serviços -> resposta por perfil.", 1.1, 5.65, 7.8, 0.38, size=14.5, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    footer(slide, 16)

    # 17
    slide = prs.slides.add_slide(blank)
    header(slide, "Visão Técnica: Manutenção e Evolução", "Como manter a plataforma saudável depois da implantação.", "Parte técnica")
    bullets(slide, [
        "Rodar migrations antes de mudanças estruturais no banco.",
        "Manter variáveis de ambiente seguras: JWT_SECRET, DATABASE_URL, FRONTEND_URL e OPENAI_API_KEY.",
        "Executar build do frontend antes de publicar nova versão.",
        "Acompanhar logs de backend, importações e eventuais erros de CORS/autenticação.",
        "Testar importações em arquivo modelo antes de atualizar bases grandes.",
        "Evoluir módulos sem quebrar perfis: preservar regras de acesso e visibilidade.",
    ], 0.95, 1.7, 5.85, 3.65, size=14)
    box(slide, 7.05, 1.8, 2.0, 3.65, fill=LIGHT)
    text(slide, "Comandos úteis", 7.25, 2.1, 1.6, 0.28, size=14, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    text(slide, "npm run build\nnpm start\nnpm --prefix backend run migrate\nnpm run seed", 7.25, 2.72, 1.55, 1.2, size=10.5, color=TEXT, align=PP_ALIGN.CENTER)
    pill(slide, "Manutenção previsível", 7.25, 4.6, 1.55, GREEN)
    footer(slide, 17)

    OUT_DIR.mkdir(exist_ok=True)
    prs.save(OUT_FILE)
    return OUT_FILE


if __name__ == "__main__":
    print(create_deck())
