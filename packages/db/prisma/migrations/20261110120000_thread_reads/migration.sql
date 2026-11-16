-- CreateTable
CREATE TABLE "ThreadRead" (
    "userId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadRead_pkey" PRIMARY KEY ("userId","threadKey")
);

