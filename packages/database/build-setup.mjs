/**
 * Gera `supabase/setup.sql`: todas as migrations concatenadas num arquivo só.
 *
 * Existe para que instalar o Dinamique num projeto Supabase novo seja UM passo
 * (colar e executar no SQL Editor) em vez de rodar dez arquivos na ordem
 * certa. As migrations continuam separadas no repositório, que é o que serve
 * para evoluir o schema; este arquivo é só o pacote de instalação.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');
const outputPath = join(here, '..', '..', 'supabase', 'setup.sql');

const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

const header = `-- ============================================================================
-- Dinamique, instalação completa
--
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e execute.
-- Ele cria o schema, as políticas de segurança, as funções e os dados iniciais.
--
-- Gerado a partir de packages/database/migrations. NÃO edite este arquivo:
-- altere a migration correspondente e rode \`pnpm --filter @dinamique/database
-- run build:setup\`.
--
-- Arquivos incluídos (${files.length}):
${files.map((name) => `--   ${name}`).join('\n')}
-- ============================================================================

`;

const body = files
  .map((name) => {
    const contents = readFileSync(join(migrationsDir, name), 'utf8');
    return `\n-- ${'='.repeat(74)}\n-- ${name}\n-- ${'='.repeat(74)}\n\n${contents}`;
  })
  .join('\n');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, header + body);

console.log(`supabase/setup.sql gerado a partir de ${files.length} migrations.`);
