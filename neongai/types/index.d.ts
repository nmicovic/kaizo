// A contract has to export at least one type of its own: that makes the
// `declare module` below extend Claude Code's types instead of replacing them.

/** An on/off switch the band's drawing reads, so flipping it redraws the band. */
export type BandSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    neongai: {
      /** The strip above the prompt is switched on (also kept in $.store across sessions). */
      isBandOn: BandSwitch
      /** Keep the strip tall although no turn is running: just switched on, or a turn just ended. */
      isBandAwake: BandSwitch
    }
  }
}
