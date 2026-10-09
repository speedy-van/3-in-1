"use client";
import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, Image, Input, Text } from "@chakra-ui/react";
import { useDisplay } from "@/hooks/use-display";
import { useKiosk } from "@/hooks/use-kiosk";
import { cacheIsFresh, formatMoney, imageUrl, menuRows, promotionIsActive } from "@/lib/model";
function Poster({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Text>The poster is temporarily unavailable.</Text> : <Image src={imageUrl(id)} alt={title} h="full" w="full" objectFit="contain" onError={() => setFailed(true)} />;
}
export function DisplayPlayer({ screenId }: { screenId: number }) {
  const { cache, connection, message, now, refresh, pair } = useDisplay(screenId);
  const kiosk = useKiosk();
  const [controls, setControls] = useState(true);
  const [code, setCode] = useState(""); const [pairError, setPairError] = useState(""); const [pairing, setPairing] = useState(false);
  const [page, setPage] = useState(0);
  const snapshot = cache?.snapshot; const screen = snapshot?.screen;
  const rows = snapshot ? menuRows(snapshot) : [];
  const pages = screen ? Math.max(1, Math.ceil(rows.length / screen.itemsPerPage)) : 1;
  useEffect(() => {
    setPage(0);
    const timer = setInterval(() => setPage(value => (value + 1) % pages), (screen?.rotationSeconds ?? 12) * 1000);
    return () => clearInterval(timer);
  }, [snapshot?.revision, screen?.rotationSeconds, pages]);
  const fresh = cacheIsFresh(cache, now);
  const start = async () => { await kiosk.start(); setControls(false); };
  const pairingPanel = connection === "pairing";
  const visibleRows = screen ? rows.slice((page % pages) * screen.itemsPerPage, (page % pages + 1) * screen.itemsPerPage) : [];
  return <Flex as="main" h="100vh" minH="400px" direction="column" bg="ink" color="paper" overflow="hidden" p={{ base: "5", md: "8" }}>
    {pairingPanel ? <Flex flex="1" align="center" justify="center"><Box maxW="420px" w="full">
      <Text color="accent" fontWeight="bold" mb="3">SCREEN {screenId}</Text><Heading size="2xl">Connect this display</Heading>
      <Text my="5">Open Screen management on your phone or computer, generate a pairing code for this screen, then enter it below.</Text>
      <Box as="form" onSubmit={async event => { event.preventDefault(); setPairing(true); setPairError("");
        try { await pair(code); setCode(""); } catch (error) { setPairError(error instanceof Error ? error.message : "Pairing failed."); } finally { setPairing(false); }
      }}>
        <Text as="label" htmlFor="pair-code" display="block" mb="2">Six-digit pairing code</Text>
        <Input id="pair-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} bg="whiteAlpha.100" fontSize="2xl" h="14" letterSpacing="0.3em" />
        <Button type="submit" mt="4" w="full" bg="accent" color="ink" loading={pairing}>Connect screen</Button>
        {pairError && <Text role="alert" mt="4" color="orange.200">{pairError}</Text>}
      </Box>
    </Box></Flex> : !fresh || !screen ? <Flex flex="1" align="center" justify="center" direction="column" textAlign="center" gap="4">
      <Text color="accent" fontWeight="bold">SCREEN {screenId}</Text>
      <Heading size="2xl">{connection === "loading" ? "Connecting to the kitchen" : "Menu temporarily unavailable"}</Heading>
      <Text maxW="600px">{connection === "loading" ? "Your display will start automatically." : "Please ask a member of staff for the current menu. This screen will reconnect automatically."}</Text>
      <Button onClick={refresh} variant="outline" color="paper">Retry connection</Button>
    </Flex> : !screen.enabled ? <Flex flex="1" align="center" justify="center" direction="column" gap="4">
      <Text color="accent">SCREEN {screenId}</Text><Heading>Display paused</Heading><Text>Enable this screen in Screen management.</Text>
    </Flex> : <>
      <Flex justify="space-between" align="center" gap="4" mb="5" flexShrink="0">
        <Box><Text color="accent" fontWeight="bold" fontSize="sm" letterSpacing="0.2em" textTransform="uppercase">From our kitchen</Text>
          <Heading as="h1" fontSize="clamp(1.5rem, 3.4vw, 4.5rem)" lineHeight="1.15" mt="2">{screen.title}</Heading></Box>
        {screen.layout === "menu" && pages > 1 && <Text color="whiteAlpha.700" whiteSpace="nowrap">{page % pages + 1} / {pages}</Text>}
      </Flex>
      {screen.layout === "poster" ? <Flex flex="1" minH="0" justify="center" align="center">
        {screen.imageId ? <Poster key={screen.imageId} id={screen.imageId} title={screen.title} /> : <Text>Add a poster image in Screen management.</Text>}
      </Flex> : rows.length ? <Grid flex="1" minH="0" templateColumns={screen.orientation === "portrait" ? "1fr" : { base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap="3" alignContent="stretch" autoRows="minmax(0, 1fr)">
        {visibleRows.map(row => <Flex key={row.key} gap="4" align="center" border="1px solid" borderColor="whiteAlpha.200" borderRadius="xl" p={{ base: "3", md: "4" }} minH="0" overflow="hidden">
          {row.item.imageId && <Image src={imageUrl(row.item.imageId)} alt="" w="clamp(3rem, 5vw, 6rem)" h="clamp(3rem, 5vw, 6rem)" objectFit="cover" borderRadius="lg" flexShrink="0" />}
          <Box flex="1" minW="0"><Text color="accent" fontSize="clamp(0.6rem, .8vw, 1rem)">{row.category}</Text>
            <Text fontWeight="bold" fontSize="clamp(.85rem, 1.55vw, 2rem)" lineHeight="1.15">{row.item.name}</Text>
            {row.variant.label !== "Standard" && <Text mt="1" fontSize="clamp(.7rem, 1vw, 1.2rem)" color="whiteAlpha.800">{row.variant.label}</Text>}</Box>
          <Text flexShrink="0" fontWeight="bold" fontSize="clamp(1rem, 2vw, 2.8rem)" color="accent">{formatMoney(row.variant.pricePence)}</Text>
        </Flex>)}
      </Grid> : <Flex flex="1" align="center" justify="center"><Text fontSize="2xl">No published items in the selected categories.</Text></Flex>}
      {promotionIsActive(screen, now) && <Box bg="accent" color="ink" p="3" borderRadius="lg" mt="4"><Text fontWeight="bold" textAlign="center" fontSize="clamp(1rem, 1.5vw, 2rem)">{screen.promotion}</Text></Box>}
      <Flex justify="space-between" align="center" mt="4" gap="4" flexShrink="0"><Text fontSize="clamp(.65rem, 1vw, 1rem)" color="whiteAlpha.800">Food allergies? Please speak to our team before ordering.</Text>
        {connection === "reconnecting" && <Text role="status" fontSize="sm" color="orange.200">Reconnecting</Text>}</Flex>
    </>}
    {!pairingPanel && <Box position="absolute" bottom="2" right="3" zIndex="10">
      {controls ? <Box bg="paper" color="ink" p="4" borderRadius="xl" maxW="350px" boxShadow="lg">
        <Text fontWeight="bold">Screen {screenId} controls</Text><Text fontSize="sm" my="2">{kiosk.wakeStatus}</Text>
        {kiosk.fullscreenError && <Text fontSize="sm" mb="2">{kiosk.fullscreenError}</Text>}
        {message && <Text fontSize="sm" mb="2">{message}</Text>}
        <Flex gap="2" wrap="wrap"><Button onClick={() => void start()} bg="ink" color="paper">Start full-screen display</Button>
          {kiosk.started && <Button variant="outline" onClick={() => void kiosk.stop()}>Stop keep-awake</Button>}
          <Button variant="ghost" onClick={() => setControls(false)}>Hide controls</Button></Flex>
      </Box> : <Button size="xs" variant="ghost" color="paper" opacity="0.5" _focusVisible={{ opacity: 1 }} _hover={{ opacity: 1 }} onClick={() => setControls(true)}>Display controls</Button>}
    </Box>}
  </Flex>;
}
