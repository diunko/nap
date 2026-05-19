/**
 * IM-02: Push data flow — terminal write → editor sees
 *
 * Proves adapter emitter → model → store → ContentPane re-render.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  getEditorContent, switchToTerminal, typeInTerminal, waitForPanelReady,
} from './fixtures';

test('IM-02: terminal write → editor sees', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // Clone fixture repo
  await cloneFixtureRepo(panel);

  // Focus napkin card and open a file
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Get the active file path (READING store for test construction, not driving)
  const filePath = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );
  expect(filePath).toBeTruthy();

  // Verify editor loaded content
  const initialContent = await getEditorContent(panel);
  expect(initialContent.length).toBeGreaterThan(0);

  // Switch to terminal and echo into the file
  await switchToTerminal(panel);
  await typeInTerminal(panel, `echo "// terminal-note-im02" >> ${filePath}`);

  // Wait for: echo completes → adapter emits → model debounce (200ms) → reloadFile
  // Then ContentPane handles the nap-external-change event
  await panel.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const ed = m.editor.getEditors()[0];
      if (!ed || !ed.getModel()) return false;
      return ed.getModel().getValue().includes('// terminal-note-im02');
    },
    { timeout: 10_000 },
  );

  const finalContent = await getEditorContent(panel);
  expect(finalContent).toContain('// terminal-note-im02');

  console.log('[IM-02] terminal write → editor sees — pipeline works');

  // ── Agent metadata: verify store has .agent.nap.json data on NavNodes ──

  const agentMeta = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const napkins = s.navSections.find((n: any) => n.name.startsWith('30-napkins'));
    const napkin = napkins?.children?.find((n: any) => n.name.includes('0100'));
    const agentsSection = napkin?.children?.find((c: any) => c.type === 'section' && c.name === 'agents');
    const agents = agentsSection?.children ?? [];
    return agents.map((a: any) => ({
      name: a.name,
      hasMetadata: !!a.metadata,
      role: a.metadata?.role ?? null,
      started: a.metadata?.started ?? null,
      exited: a.metadata?.exited ?? null,
    }));
  });

  // Fixture has 3 agents — each should have metadata from .agent.nap.json
  expect(agentMeta.length).toBe(3);
  for (const agent of agentMeta) {
    expect(agent.hasMetadata).toBe(true);
    expect(agent.role).toBeTruthy();
  }
  console.log('[IM-02] agent metadata:', JSON.stringify(agentMeta));

  // Change an agent's started field via terminal → verify store updates
  const agentJsonPath = '/home/user/nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/agents/003-test-eng-routing/.agent.nap.json';
  await typeInTerminal(panel, `echo '{"role":"test-eng","name":"003-test-eng-routing","started":true,"exited":false}' > ${agentJsonPath}`);

  // Wait for the store to reflect the change
  await panel.waitForFunction(
    () => {
      const s = (window as any).__napStore__.getState();
      const napkins = s.navSections.find((n: any) => n.name.startsWith('30-napkins'));
      const napkin = napkins?.children?.find((n: any) => n.name.includes('0100'));
      const agentsSection = napkin?.children?.find((c: any) => c.type === 'section' && c.name === 'agents');
      const agent = agentsSection?.children?.find((a: any) => a.name.includes('003'));
      return agent?.metadata?.started === true;
    },
    { timeout: 10_000 },
  );

  const updatedAgent = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const napkins = s.navSections.find((n: any) => n.name.startsWith('30-napkins'));
    const napkin = napkins?.children?.find((n: any) => n.name.includes('0100'));
    const agentsSection = napkin?.children?.find((c: any) => c.type === 'section' && c.name === 'agents');
    const agent = agentsSection?.children?.find((a: any) => a.name.includes('003'));
    return { started: agent?.metadata?.started, exited: agent?.metadata?.exited, role: agent?.metadata?.role };
  });

  expect(updatedAgent.started).toBe(true);
  expect(updatedAgent.exited).toBe(false);
  expect(updatedAgent.role).toBe('test-eng');
  console.log('[IM-02] agent metadata update via terminal → store reflects change');
});
