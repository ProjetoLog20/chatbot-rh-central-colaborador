from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "apresentacoes"
OUT_FILE = OUT_DIR / "Central_do_Colaborador_LOG20_apresentacao.pptx"
LOGO = ROOT / "frontend" / "public" / "rh-logo.jpg"
MASCOT = ROOT / "frontend" / "public" / "mascote-ia.png"

BLUE = RGBColor(0, 90, 140)
DARK = RGBColor(0, 59, 104)
ORANGE = RGBColor(232, 117, 34)
GREEN = RGBColor(32, 140, 105)
TEXT = RGBColor(31, 41, 55)
MUTED = RGBColor(100, 116, 139)
LIGHT = RGBColor(241, 245, 249)
WHITE = RGBColor(255, 255, 255)


def safe_image(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def set_text(box, text, size=20, bold=False, color=TEXT, align=None):
    frame = box.text_frame
    frame.clear()
    paragraph = frame.paragraphs[0]
    paragraph.text = text
    if align:
        paragraph.alignment = align
    run = paragraph.runs[0]
    run.font.name = "Aptos"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def add_text(slide, text, x, y, w, h, size=20, bold=False, color=TEXT, align=None):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    return set_text(box, text, size=size, bold=bold, color=color, align=align)


def add_header(slide, title, kicker=None):
    add_text(slide, title, 0.65, 0.35, 8.8, 0.45, size=25, bold=True, color=DARK)
    if kicker:
        add_text(slide, kicker, 0.67, 0.86, 8.2, 0.3, size=10.5, color=MUTED)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.65), Inches(1.18), Inches(8.7), Inches(0.03))
    line.fill.solid()
    line.fill.fore_color.rgb = ORANGE
    line.line.fill.background()


def add_footer(slide, n):
    add_text(slide, f"Central do Colaborador LOG20 | {n:02}", 8.45, 7.02, 1.2, 0.25, size=7.5, color=MUTED, align=PP_ALIGN.RIGHT)


def rounded_box(slide, x, y, w, h, fill=WHITE, line=RGBColor(226, 232, 240), radius=True):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
        Inches(x),
        Inches(y),
        Inches(w),
        Inches(h),
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(1)
    return shape


def bullet_list(slide, items, x, y, w, h, size=15, color=TEXT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    for idx, item in enumerate(items):
        p = frame.paragraphs[0] if idx == 0 else frame.add_paragraph()
        p.text = item
        p.level = 0
        p.font.name = "Aptos"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(7)
    return box


def add_pill(slide, text, x, y, w, color):
    shape = rounded_box(slide, x, y, w, 0.36, fill=color, line=color)
    shape.text_frame.margin_left = Inches(0.08)
    shape.text_frame.margin_right = Inches(0.08)
    p = shape.text_frame.paragraphs[0]
    p.text = text
    p.alignment = PP_ALIGN.CENTER
    p.font.name = "Aptos"
    p.font.size = Pt(10.5)
    p.font.bold = True
    p.font.color.rgb = WHITE
    return shape


def add_metric(slide, number, label, x, y, color):
    rounded_box(slide, x, y, 2.0, 1.05, fill=WHITE)
    add_text(slide, number, x + 0.15, y + 0.12, 1.7, 0.32, size=20, bold=True, color=color)
    add_text(slide, label, x + 0.15, y + 0.53, 1.7, 0.34, size=10.5, color=MUTED)


def add_module_card(slide, title, desc, x, y, color):
    rounded_box(slide, x, y, 2.8, 0.88, fill=WHITE)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(0.09), Inches(0.88))
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    add_text(slide, title, x + 0.22, y + 0.12, 2.35, 0.22, size=12.5, bold=True, color=DARK)
    add_text(slide, desc, x + 0.22, y + 0.4, 2.35, 0.28, size=8.7, color=MUTED)


def add_arch_box(slide, title, details, x, y, w, color):
    rounded_box(slide, x, y, w, 1.05, fill=WHITE)
    add_text(slide, title, x + 0.18, y + 0.12, w - 0.36, 0.25, size=12.5, bold=True, color=color)
    add_text(slide, details, x + 0.18, y + 0.45, w - 0.36, 0.38, size=9, color=MUTED)


def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # 1. Cover
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = DARK
    slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(5.55), Inches(10), Inches(1.95)).fill.solid()
    slide.shapes[-1].fill.fore_color.rgb = BLUE
    if safe_image(LOGO):
        slide.shapes.add_picture(str(LOGO), Inches(0.7), Inches(0.55), height=Inches(0.68))
    if safe_image(MASCOT):
        slide.shapes.add_picture(str(MASCOT), Inches(6.9), Inches(1.15), height=Inches(4.35))
    add_text(slide, "Central do Colaborador", 0.7, 1.85, 5.5, 0.62, size=33, bold=True, color=WHITE)
    add_text(slide, "Yuri, Assistente de RH", 0.72, 2.55, 4.8, 0.38, size=18, color=RGBColor(226, 232, 240))
    add_text(slide, "Portal de autosserviço, comunicação interna, indicadores e atendimento inteligente para colaboradores, motoristas e administradores.", 0.72, 3.2, 5.8, 0.86, size=17, color=WHITE)
    add_pill(slide, "React + Node + IA + Excel/CSV + Governança", 0.72, 4.35, 3.9, ORANGE)
    add_text(slide, "Apresentação comercial e funcional", 0.72, 6.45, 4.2, 0.32, size=12, color=RGBColor(226, 232, 240))

    # 2. Problem
    slide = prs.slides.add_slide(blank)
    add_header(slide, "O Desafio do RH Operacional", "Quando as informações ficam espalhadas, o atendimento vira retrabalho.")
    pain_points = [
        ("Dúvidas repetidas", "RH responde sempre as mesmas perguntas sobre processos, acesso e políticas."),
        ("Dados em planilhas", "SKAP, prontuário, produtividade e campanhas dependem de arquivos atualizados manualmente."),
        ("Baixa visibilidade", "O colaborador não sabe onde consultar status, indicadores ou orientações."),
        ("Governança difícil", "Nem todo conteúdo deve aparecer para todos os perfis, e módulos precisam de controle operacional."),
    ]
    for i, (title, desc) in enumerate(pain_points):
        x = 0.75 + (i % 2) * 4.45
        y = 1.65 + (i // 2) * 1.75
        rounded_box(slide, x, y, 3.95, 1.25, fill=LIGHT)
        add_text(slide, title, x + 0.22, y + 0.18, 3.4, 0.25, size=15, bold=True, color=DARK)
        add_text(slide, desc, x + 0.22, y + 0.52, 3.42, 0.42, size=11, color=TEXT)
    add_metric(slide, "1", "entrada única para o colaborador", 0.95, 5.55, BLUE)
    add_metric(slide, "3", "perfis de acesso: admin, motorista e colaborador", 3.25, 5.55, ORANGE)
    add_metric(slide, "IA", "apoio 24/7 com base oficial do RH", 5.55, 5.55, GREEN)
    add_footer(slide, 2)

    # 3. Solution
    slide = prs.slides.add_slide(blank)
    add_header(slide, "A Solução", "Uma central única que combina autosserviço, indicadores e atendimento assistido.")
    rounded_box(slide, 0.75, 1.55, 3.0, 4.9, fill=LIGHT)
    add_text(slide, "Central do Colaborador", 1.02, 1.95, 2.45, 0.36, size=18, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    if safe_image(MASCOT):
        slide.shapes.add_picture(str(MASCOT), Inches(1.33), Inches(2.55), height=Inches(2.15))
    add_text(slide, "Acesso autenticado por matrícula, experiência simples e cards por perfil.", 1.0, 5.15, 2.5, 0.55, size=11, color=TEXT, align=PP_ALIGN.CENTER)
    bullets = [
        "Colaborador consulta informações próprias e participa de pesquisas.",
        "Motoristas e ajudantes acessam prontuário, rotograma e indicadores de rota.",
        "Administrador importa bases, publica ações e configura módulos.",
        "Yuri responde perguntas com IA ou base oficial cadastrada pelo RH.",
    ]
    bullet_list(slide, bullets, 4.25, 1.65, 4.9, 2.25, size=15)
    add_arch_box(slide, "Experiência guiada", "Cards com status, manutenção e visibilidade por perfil.", 4.25, 4.45, 2.15, BLUE)
    add_arch_box(slide, "Dados atualizáveis", "Importação por Excel/CSV com validação e logs.", 6.75, 4.45, 2.15, ORANGE)
    add_footer(slide, 3)

    # 4. User journey
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Jornada do Colaborador", "Do primeiro acesso ao atendimento inteligente em poucos passos.")
    steps = [
        ("1. Login", "Matrícula e senha temporária."),
        ("2. Troca obrigatória", "Primeiro acesso exige nova senha."),
        ("3. Central personalizada", "Cards conforme perfil e módulos ativos."),
        ("4. Consulta e participação", "SKAP, clima, segurança, rotas e produtividade."),
        ("5. Yuri", "Dúvidas respondidas com base oficial e IA."),
    ]
    for i, (title, desc) in enumerate(steps):
        x = 0.65 + i * 1.82
        rounded_box(slide, x, 2.0, 1.55, 2.0, fill=WHITE)
        circ = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.5), Inches(1.45), Inches(0.55), Inches(0.55))
        circ.fill.solid()
        circ.fill.fore_color.rgb = ORANGE if i % 2 else BLUE
        circ.line.fill.background()
        add_text(slide, str(i + 1), x + 0.5, 1.56, 0.55, 0.22, size=12, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(slide, title, x + 0.12, 2.25, 1.3, 0.35, size=12.5, bold=True, color=DARK, align=PP_ALIGN.CENTER)
        add_text(slide, desc, x + 0.16, 2.82, 1.22, 0.58, size=9.2, color=MUTED, align=PP_ALIGN.CENTER)
    rounded_box(slide, 1.2, 5.2, 7.6, 0.8, fill=LIGHT)
    add_text(slide, "Resultado: menos dependência de atendimento manual e mais autonomia para quem está na operação.", 1.45, 5.42, 7.05, 0.3, size=14.5, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    add_footer(slide, 4)

    # 5. Modules
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Módulos Entregues", "Cards ativáveis por perfil, com manutenção e ordenação pelo administrador.")
    modules = [
        ("Pesquisa de Clima", "Participação e acompanhamento de pesquisas.", BLUE),
        ("SKAP", "Evolução, nível e habilidades avaliadas.", DARK),
        ("Campeão de Segurança", "Reconhecimento de atitudes seguras.", ORANGE),
        ("3 Rs", "Responsabilidades, recursos e reconhecimentos.", GREEN),
        ("Prêmio de Produtividade", "Indicadores, metas e valor previsto.", DARK),
        ("Indicadores da Rota", "Metas para rota produtiva e segura.", BLUE),
        ("Rotograma Seguro", "Rotas, riscos e orientações de segurança.", ORANGE),
        ("Prontuário do Motorista", "Pontuação, faixa e ocorrências.", GREEN),
        ("Ouvidoria", "Acesso ao canal oficial.", DARK),
    ]
    for idx, (title, desc, color) in enumerate(modules):
        add_module_card(slide, title, desc, 0.75 + (idx % 3) * 3.05, 1.55 + (idx // 3) * 1.25, color)
    add_footer(slide, 5)

    # 6. Yuri
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Yuri: Assistente de RH", "Atendimento inteligente com linguagem simples e limites de segurança.")
    if safe_image(MASCOT):
        slide.shapes.add_picture(str(MASCOT), Inches(0.85), Inches(1.55), height=Inches(3.9))
    rounded_box(slide, 4.15, 1.55, 4.85, 3.2, fill=LIGHT)
    add_text(slide, "Como o Yuri responde", 4.45, 1.88, 4.1, 0.32, size=17, bold=True, color=DARK)
    bullet_list(slide, [
        "Consulta a base oficial cadastrada no painel admin.",
        "Usa IA quando habilitada no backend, sem expor chave no frontend.",
        "Personaliza orientações com dados permitidos do usuário autenticado.",
        "Orienta procurar o RH em temas sensíveis, contestação ou dados pessoais.",
    ], 4.45, 2.35, 4.15, 1.62, size=12.5)
    add_pill(slide, "OpenAI opcional", 4.45, 4.25, 1.4, BLUE)
    add_pill(slide, "Fallback local", 6.05, 4.25, 1.35, ORANGE)
    add_pill(slide, "Log de atendimentos", 7.55, 4.25, 1.35, GREEN)
    rounded_box(slide, 1.0, 6.0, 8.0, 0.62, fill=WHITE)
    add_text(slide, "Valor prático: o RH mantém controle do conteúdo e o colaborador recebe resposta rápida, padronizada e acolhedora.", 1.22, 6.18, 7.52, 0.24, size=12.5, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    add_footer(slide, 6)

    # 7. Admin
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Central do Administrador", "Operação do conteúdo e dos dados sem depender de edição técnica.")
    admin_items = [
        ("Importação Excel/CSV", "Colaboradores, prontuários e base do Yuri com modelos para download."),
        ("Dados publicados", "Consulta de colaboradores, prontuários e reset de senha temporária."),
        ("Ações e eventos", "Publicação com imagem para CIPA, Café com o Gerente e Comitê de Gente."),
        ("Configuração de módulos", "Ativar, ocultar, ordenar ou colocar painéis em manutenção."),
        ("Campeão de Segurança", "Gestão de reconhecimentos e campanhas de segurança."),
        ("Contador de acessos", "Visão administrativa de uso do aplicativo."),
    ]
    for i, (title, desc) in enumerate(admin_items):
        x = 0.8 + (i % 2) * 4.25
        y = 1.55 + (i // 2) * 1.35
        add_arch_box(slide, title, desc, x, y, 3.75, BLUE if i % 2 == 0 else ORANGE)
    add_footer(slide, 7)

    # 8. Data and integrations
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Dados e Integrações", "Projetado para encaixar no fluxo atual de planilhas e evoluir para produção.")
    add_arch_box(slide, "Entrada", "Planilhas Excel/CSV, cadastros administrativos e respostas oficiais do RH.", 0.75, 1.55, 2.6, BLUE)
    add_arch_box(slide, "Processamento", "Validação, upsert por matrícula, logs de importação e histórico quando aplicável.", 3.7, 1.55, 2.6, ORANGE)
    add_arch_box(slide, "Publicação", "Cards, tabelas, pesquisas, indicadores e respostas do Yuri para cada perfil.", 6.65, 1.55, 2.6, GREEN)
    bullet_list(slide, [
        "Banco local SQLite para desenvolvimento e suporte a PostgreSQL/Supabase em produção.",
        "Backend Express centraliza autenticação, APIs, importações e regras de visibilidade.",
        "Frontend React/Vite entrega experiência responsiva e protegida por rota.",
        "Deploy previsto no Render, com frontend servido pelo próprio backend em produção.",
    ], 1.0, 3.55, 8.0, 1.9, size=14)
    add_footer(slide, 8)

    # 9. Security
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Segurança e Governança", "Acesso por perfil, dados próprios e IA com fronteiras claras.")
    security = [
        ("JWT e rotas protegidas", "Login por matrícula e autorização para áreas administrativas."),
        ("Primeiro acesso seguro", "Senha temporária obriga troca antes de usar a central."),
        ("Separação de perfis", "Colaborador e motorista veem somente dados próprios; admin gerencia a base."),
        ("Chaves no backend", "OPENAI_API_KEY e JWT_SECRET não ficam expostos no frontend."),
        ("Privacidade no Yuri", "IA não deve receber CPF, telefone ou e-mail; temas sensíveis são direcionados ao RH."),
        ("Controle operacional", "Módulos podem ficar invisíveis ou em manutenção sem novo deploy."),
    ]
    for i, (title, desc) in enumerate(security):
        x = 0.8 + (i % 2) * 4.25
        y = 1.5 + (i // 2) * 1.35
        add_arch_box(slide, title, desc, x, y, 3.75, DARK)
    add_footer(slide, 9)

    # 10. Architecture
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Arquitetura Técnica", "Stack simples, conhecida e pronta para manutenção.")
    layers = [
        ("Frontend", "React + Vite\nRotas protegidas\nCards e dashboards", BLUE),
        ("Backend", "Node.js + Express\nAPIs REST\nJWT e CORS", ORANGE),
        ("Dados", "SQLite dev\nPostgreSQL/Supabase prod\nMigrations e logs", GREEN),
        ("IA", "OpenAI Responses API\nBase oficial do RH\nFallback local", DARK),
    ]
    for i, (title, details, color) in enumerate(layers):
        x = 0.8 + i * 2.25
        rounded_box(slide, x, 2.05, 1.85, 2.45, fill=WHITE)
        add_text(slide, title, x + 0.18, 2.32, 1.48, 0.3, size=15, bold=True, color=color, align=PP_ALIGN.CENTER)
        add_text(slide, details, x + 0.22, 3.0, 1.4, 0.78, size=10.5, color=TEXT, align=PP_ALIGN.CENTER)
    add_text(slide, "Produção: Render + Supabase + variáveis de ambiente + migrations antes do start.", 1.15, 5.45, 7.7, 0.4, size=15, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    add_footer(slide, 10)

    # 11. Value
    slide = prs.slides.add_slide(blank)
    add_header(slide, "Valor Para a Operação", "Benefícios objetivos para RH, liderança e colaboradores.")
    values = [
        ("Para o RH", "Reduz perguntas repetidas, padroniza respostas e facilita publicação de dados."),
        ("Para a liderança", "Dá visibilidade a segurança, produtividade, engajamento e campanhas."),
        ("Para o colaborador", "Centraliza informações, evita deslocamentos desnecessários e aumenta autonomia."),
        ("Para TI/gestão", "Stack simples, baixo acoplamento e caminho claro para deploy e evolução."),
    ]
    for i, (title, desc) in enumerate(values):
        x = 0.85 + (i % 2) * 4.3
        y = 1.75 + (i // 2) * 1.75
        rounded_box(slide, x, y, 3.85, 1.25, fill=LIGHT)
        add_text(slide, title, x + 0.22, y + 0.2, 3.2, 0.28, size=16, bold=True, color=DARK)
        add_text(slide, desc, x + 0.22, y + 0.57, 3.25, 0.38, size=11.2, color=TEXT)
    add_metric(slide, "Menos", "retrabalho de atendimento", 1.3, 5.65, BLUE)
    add_metric(slide, "Mais", "engajamento e transparência", 4.0, 5.65, ORANGE)
    add_metric(slide, "Melhor", "governança dos dados", 6.7, 5.65, GREEN)
    add_footer(slide, 11)

    # 12. Next steps
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = DARK
    if safe_image(LOGO):
        slide.shapes.add_picture(str(LOGO), Inches(0.65), Inches(0.55), height=Inches(0.62))
    add_text(slide, "Próximos Passos", 0.75, 1.55, 5.2, 0.62, size=32, bold=True, color=WHITE)
    next_steps = [
        "Validar identidade visual final e domínio de produção.",
        "Definir responsáveis por dados, importações e base oficial do Yuri.",
        "Rodar carga inicial de colaboradores, prontuários, SKAP e produtividade.",
        "Publicar no Render com PostgreSQL/Supabase e variáveis seguras.",
        "Treinar administradores e fazer piloto com grupo controlado.",
    ]
    bullet_list(slide, next_steps, 0.95, 2.55, 5.35, 2.45, size=15, color=WHITE)
    rounded_box(slide, 6.75, 1.55, 2.35, 3.95, fill=WHITE)
    add_text(slide, "Mensagem de venda", 7.05, 1.95, 1.75, 0.35, size=16, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    add_text(slide, "Um app de RH pronto para reduzir atrito operacional, organizar indicadores e aproximar colaborador, liderança e RH em uma única experiência.", 7.05, 2.6, 1.75, 1.65, size=13, color=TEXT, align=PP_ALIGN.CENTER)
    add_pill(slide, "Pronto para demonstração", 7.08, 4.65, 1.7, ORANGE)

    OUT_DIR.mkdir(exist_ok=True)
    prs.save(OUT_FILE)
    return OUT_FILE


if __name__ == "__main__":
    output = create_deck()
    print(output)
