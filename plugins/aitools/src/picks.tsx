import type { Elements } from 'claude-code'

type El = Pick<Elements['terminal'], 'Box' | 'Button'>

/** Behind the picked choice: a Button takes no background, so a Box behind it carries one the white label reads on. */
const PICKED_BACKGROUND = '#2e2e2c'

/**
 * One choice of a pane's option row, as the bar's own buttons (plain, compact): the one picked at full strength on a
 * grey ground, the rest dim. Pressing the picked one picks it again, changing nothing.
 */
export function renderPick(el: El, key: string, label: string, isPicked: boolean, onPick: () => void) {
  const { Box, Button } = el

  return isPicked ? (
    <Box key={`picked-${key}`} backgroundColor={PICKED_BACKGROUND}>
      <Button key={key} label={label} plain dimColor={false} onPress={() => onPick()} />
    </Box>
  ) : (
    <Button key={key} label={label} plain dimColor onPress={() => onPick()} />
  )
}
