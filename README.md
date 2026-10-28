# REA Cloud | Lance Marketing Digital

Servidor MCP do [REA (Reverse Engineer Anything)](https://github.com/morluto/rea), isolado da plataforma principal da Lance.

## Implantação gratuita

[**Criar REA Cloud no Render Free**](https://render.com/deploy?repo=https://github.com/Lancemarketingdigital/lance-rea-runtime)

O arquivo `render.yaml` seleciona exclusivamente o plano **free**, sem banco de dados, disco pago ou auto-deploy. O Render gera a chave `REA_PUBLIC_API_KEY` de 256 bits, que não é gravada neste repositório. O domínio desejado é `rea.lancemktdigital.com.br`. Após o usuário confirmar o Blueprint, é necessário apontar o DNS do subdomínio na Cloudflare, conforme a indicação do painel Render.

**Uso e limitações:** o plano gratuito desliga após 15 minutos ociosos, pode levar cerca de um minuto para acordar, perde arquivos locais após reinicialização e não garante disponibilidade permanente. Não utilize para análises com dados confidenciais de clientes sem isolamento, retenção e permissões adicionais.

## Endpoints

| Rota | Acesso | Função |
|---|---|---|
| `GET /` | Público | Página informativa de status |
| `GET /health` | Público | Saúde de inicialização |
| `POST /mcp` | Bearer obrigatório | REA MCP HTTP |
| `GET /mcp` | Bearer obrigatório | Respostas/eventos MCP |
| `POST /artifacts` | Bearer obrigatório + desabilitado por padrão | Upload temporário |

Não divulgue `REA_PUBLIC_API_KEY` e não configure esse segredo no navegador público. O RAUL precisa de um adaptador MCP com segredo guardado no backend para executar análises.

## Código de origem e segurança

Runtime: `node:24.22.1-bookworm-slim` + pacote oficial `rea-agents@6.8.0`. A instância escuta na porta `PORT` do provedor e o servidor MCP fica restrito à interface local. O aplicativo nunca inicializa a rota MCP sem um Bearer válido. Nenhuma conta, token, arquivo de cliente ou código interno do RAUL está neste repositório. A pasta de upload fica desabilitada até haver isolamento por cliente.

## Validação pós-deploy

1. Verificar `GET /` e `GET /health` na URL Render, respeitando tempo de ativação.
2. Verificar que `POST /mcp` sem chave ou com chave incorreta retorna 401.
3. A partir de um executor **autenticado**, validar `initialize` e `tools/list`.
4. Vincular o domínio personalizado no Render e configurar DNS Cloudflare.
5. Criar integração RAUL: armazenar secret no backend, registrar resultados e aplicar autorização por cliente.

Apenas códigos e softwares próprios ou com autorização de análise devem ser enviados ao REA.
