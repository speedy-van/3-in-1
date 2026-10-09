"use client";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <Box as="main" p="8"><Heading>Something interrupted the page</Heading><Text my="4">Please try again. Your saved settings have not been changed.</Text><Button onClick={reset}>Try again</Button></Box>;
}
