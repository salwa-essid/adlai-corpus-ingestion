CREATE TABLE IF NOT EXISTS tenants (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    data_residency TEXT NOT NULL
    CHECK (
              data_residency IN (
              'sovereign',
              'standard'
                                )
    ),
    created_at TIMESTAMPTZ DEFAULT NOW()
    )