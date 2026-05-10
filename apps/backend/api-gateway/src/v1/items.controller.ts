import { Controller, Get } from "@nestjs/common";

const DUMMY_ITEMS = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 14.99 },
  { id: "3", name: "Gizmo", price: 19.99 },
  { id: "4", name: "Doohickey", price: 4.99 },
];

@Controller("api/v1/items")
export class ItemsController {
  @Get()
  list() {
    return DUMMY_ITEMS;
  }
}
