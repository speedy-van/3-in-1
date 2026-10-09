"use client";
import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, Image, Link, Text } from "@chakra-ui/react";
import { formatMoney, imageUrl, itemSchema, type MenuItem } from "@/lib/model";
import { z } from "zod";
const responseSchema = z.object({ items: z.array(itemSchema), categories: z.array(z.object({ id: z.string(), name: z.string() })), revision: z.number() });
export function PublicMenu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState("loading"); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setStatus("loading");
    void fetch("/api/signage/menu", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const data = responseSchema.parse(await response.json());
      if (active) { setItems(data.items); setCategories(data.categories); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [retry]);
  return <Box as="main" maxW="1200px" mx="auto" px={{ base: "5", md: "8" }} pb="16">
    <Flex as="header" justify="space-between" align="center" py="6"><Text fontWeight="bold" letterSpacing=".12em">FROM OUR KITCHEN</Text><Link href="/admin/screens" fontSize="sm">Staff sign in</Link></Flex>
    <Box bg="ink" color="paper" borderRadius="2xl" px={{ base: "6", md: "12" }} py={{ base: "10", md: "16" }} mb="8"><Text color="accent" mb="3" fontWeight="bold">THE MENU</Text><Heading fontSize={{ base: "4xl", md: "6xl" }} maxW="650px" lineHeight="1.05">Find your next favourite.</Heading><Text mt="5" maxW="600px">Explore our published menu. Food allergies or intolerances? Speak to our team before ordering.</Text></Box>
    {status === "loading" ? <Text role="status">Loading the menu...</Text> : status === "error" ? <Box><Heading size="lg">Menu temporarily unavailable</Heading><Text my="4">Please ask our team for the current menu and prices.</Text><Button onClick={() => setRetry(value => value + 1)}>Try again</Button></Box> : !items.length ? <Box><Heading size="lg">Our menu is being prepared</Heading><Text mt="3">Please ask our team for the current menu and prices.</Text></Box> : categories.map(category => {
      const selected = items.filter(item => item.categoryId === category.id);
      return selected.length ? <Box as="section" key={category.id} mb="10"><Heading size="2xl" mb="5">{category.name}</Heading><Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="4">{selected.map(item => <Box key={item.id} p="5" bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200"><Flex gap="4" mb="3">{item.imageId && <Image src={imageUrl(item.imageId)} alt="" w="20" h="20" objectFit="cover" borderRadius="lg" />}<Box><Heading size="lg">{item.name}</Heading><Text fontSize="sm" mt="2" color="muted">{item.description}</Text></Box></Flex>{item.variants.map(variant => <Flex key={variant.id} justify="space-between" gap="3" mt="2"><Text>{variant.label}</Text><Text fontWeight="bold">{formatMoney(variant.pricePence)}</Text></Flex>)}</Box>)}</Grid></Box> : null;
    })}
  </Box>;
}
