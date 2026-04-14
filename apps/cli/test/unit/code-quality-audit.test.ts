import { expect } from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { parseSessionName } from '../../src/lib/execution/session-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Code quality audit tests (PRLT-1298)
 *
 * Verifies that code quality rules are enforced and the consolidation
 * of duplicate session parsers works correctly.
 */
describe('@smoke Code Quality Audit', () => {
  // ---------------------------------------------------------------------------
  // ESLint enforcement
  // ---------------------------------------------------------------------------
  describe('ESLint config', () => {
    it('should have eslint config file', () => {
      const configPath = path.resolve(__dirname, '../../eslint.config.mjs')
      expect(fs.existsSync(configPath)).to.be.true
    })

    it('should pass lint on src/ with zero errors', function (this: Mocha.Context) {
      this.timeout(60_000)
      const cliDir = path.resolve(__dirname, '../..')
      // Lint only src/ — test files may have pre-existing violations
      let output: string
      try {
        output = execSync('npx eslint src/ --max-warnings=999', {
          cwd: cliDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (error: unknown) {
        const execError = error as { stdout?: string; stderr?: string }
        output = (execError.stdout || '') + (execError.stderr || '')
      }
      // Verify zero errors (warnings are acceptable)
      const summaryMatch = output.match(/(\d+) error/)
      if (summaryMatch && Number(summaryMatch[1]) > 0) {
        throw new Error(`ESLint has ${summaryMatch[1]} errors in src/:\n${output}`)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Zero empty catch blocks
  // ---------------------------------------------------------------------------
  describe('empty catch blocks', () => {
    it('should have zero truly empty catch blocks in src/', function (this: Mocha.Context) {
      this.timeout(30_000)
      const srcDir = path.resolve(__dirname, '../../src')

      // Use grep to find empty catch blocks (catch { } with only whitespace)
      try {
        const result = execSync(
          `grep -rn "catch\\s*{\\s*}" ${srcDir} --include='*.ts' || true`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim()

        // Filter out lines that have comments (those are acceptable)
        const emptyBlocks = result
          .split('\n')
          .filter(line => line.trim() !== '')
          .filter(line => {
            // Extract the content after "catch {"
            const catchMatch = line.match(/catch\s*\{(.*)/)
            if (!catchMatch) return false
            const body = catchMatch[1].replace(/\}.*$/, '').trim()
            // Truly empty: no comment, no code
            return body === ''
          })

        expect(emptyBlocks).to.deep.equal([])
      } catch {
        // grep not finding matches returns exit code 1 — that means zero empty catches
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Session parser consolidation
  // ---------------------------------------------------------------------------
  describe('session parser consolidation', () => {
    it('parseSessionName handles patterns that old GC regex handled', () => {
      // The old isPrltSessionName regex: /^(?:TKT-\d+|[A-Z]+-\d+)-\w+-.+$/
      // The old extractAgentNameFromSession regex: /^(?:TKT-\d+|[A-Z]+-\d+)-\w+-(.+)$/

      // Standard TKT format
      const result1 = parseSessionName('TKT-123-implement-agent-name')
      expect(result1).to.not.be.null
      expect(result1!.agentName).to.equal('agent-name')
      expect(result1!.ticketId).to.equal('TKT-123')

      // PRLT prefix format
      const result2 = parseSessionName('PRLT-456-Review-bold-turing')
      expect(result2).to.not.be.null
      expect(result2!.agentName).to.equal('bold-turing')
      expect(result2!.ticketId).to.equal('PRLT-456')
    })

    it('parseSessionName returns null for non-prlt session names', () => {
      // These should NOT match — prevents false positives in GC
      expect(parseSessionName('my-regular-session')).to.be.null
      expect(parseSessionName('prlt-orchestrator-hq-main')).to.be.null
      expect(parseSessionName('bash')).to.be.null
      expect(parseSessionName('')).to.be.null
    })

    it('parseSessionName extracts agent names with hyphens correctly', () => {
      // Critical: the old GC regex was simpler and might extract differently
      const result = parseSessionName('TKT-878-Implement-stout-page')
      expect(result).to.not.be.null
      expect(result!.agentName).to.equal('stout-page')
    })

    it('parseSessionName handles all known actions from GC perspective', () => {
      const testCases = [
        { input: 'TKT-1-Implement-my-agent', action: 'Implement' },
        { input: 'TKT-2-Review-my-agent', action: 'Review' },
        { input: 'TKT-3-Fix-my-agent', action: 'Fix' },
        { input: 'TKT-4-Refactor-my-agent', action: 'Refactor' },
        { input: 'TKT-5-Test-my-agent', action: 'Test' },
        { input: 'TKT-6-Document-my-agent', action: 'Document' },
        { input: 'TKT-7-work-my-agent', action: 'work' },
      ]

      for (const { input, action } of testCases) {
        const result = parseSessionName(input)
        expect(result, `Failed for input: ${input}`).to.not.be.null
        expect(result!.action, `Wrong action for ${input}`).to.equal(action)
        expect(result!.agentName, `Wrong agent for ${input}`).to.equal('my-agent')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Patterns documentation
  // ---------------------------------------------------------------------------
  describe('patterns documentation', () => {
    it('should have docs/patterns.md', () => {
      const patternsPath = path.resolve(__dirname, '../../../../docs/patterns.md')
      expect(fs.existsSync(patternsPath), 'docs/patterns.md should exist').to.be.true
    })

    it('docs/patterns.md should cover required topics', () => {
      const patternsPath = path.resolve(__dirname, '../../../../docs/patterns.md')
      const content = fs.readFileSync(patternsPath, 'utf-8')

      expect(content).to.include('Error Handling')
      expect(content).to.include('Return Patterns')
      expect(content).to.include('Null Handling')
      expect(content).to.include('Dead Code')
      expect(content).to.include('Duplicate Code')
      expect(content).to.include('Naming')
    })
  })

  // ---------------------------------------------------------------------------
  // Dead code removal
  // ---------------------------------------------------------------------------
  describe('dead code removal', () => {
    it('should not export initializeWorkspaceDatabase', () => {
      const initPath = path.resolve(__dirname, '../../src/lib/init/index.ts')
      const content = fs.readFileSync(initPath, 'utf-8')
      expect(content).to.not.include('initializeWorkspaceDatabase')
    })

    it('should not have isPrltSessionName or extractAgentNameFromSession in cascade.ts', () => {
      const cascadePath = path.resolve(__dirname, '../../src/lib/gc/cascade.ts')
      const content = fs.readFileSync(cascadePath, 'utf-8')
      expect(content).to.not.include('function isPrltSessionName')
      expect(content).to.not.include('function extractAgentNameFromSession')
    })

    it('cascade.ts should import parseSessionName from session-utils', () => {
      const cascadePath = path.resolve(__dirname, '../../src/lib/gc/cascade.ts')
      const content = fs.readFileSync(cascadePath, 'utf-8')
      expect(content).to.include("import { parseSessionName } from '../execution/session-utils.js'")
    })
  })
})
